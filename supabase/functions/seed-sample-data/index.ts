import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceRoleClient, getHospitalId, requireUser, userHasAnyRole } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceRoleClient();

    // Only admins/inventory managers may (re-)seed the database -- this
    // writes with the service role key, which bypasses RLS entirely.
    const user = await requireUser(supabase, req);
    const hospitalId = await getHospitalId(supabase, user.id);
    const authorized = await userHasAnyRole(supabase, user.id, ["admin", "inventory_manager"]);
    if (!authorized) {
      return jsonResponse({ error: "Only admins or inventory managers can seed data" }, 403);
    }

    // Idempotency: skip if THIS HOSPITAL already has inventory data. Scoped
    // by hospital_id (not a global count) -- otherwise, once any one
    // hospital had seeded data, no other hospital could ever seed at all.
    const { count, error: countError } = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", hospitalId);

    if (countError) {
      throw countError;
    }

    if (count && count > 0) {
      return jsonResponse({
        success: true,
        message: "Database already has inventory data; skipped seeding",
        stats: { inventory_items: 0, predictions: 0, alerts: 0 },
      });
    }

    console.log("Starting data seeding...");

    // Vendor mapping from vendor_data.csv
    const vendorMap: Record<string, string> = {
      "V001": "MedSupplies Inc.",
      "V002": "EquipMed Co.",
      "V003": "HealthTools Ltd."
    };

    // Real inventory data from inventory_data.csv (sample representative items)
    const inventoryItems = [
      {
        item_name: "Ventilator",
        item_type: "Equipment",
        current_stock: 2487,
        min_required: 656,
        max_capacity: 3556,
        unit_cost: 5832.29,
        avg_usage_per_day: 55,
        restock_lead_time: 12,
        vendor_name: "MedSupplies Inc.",
        demand_category: "respiratory_airway"
      },
      {
        item_name: "Surgical Mask",
        item_type: "Equipment",
        current_stock: 2371,
        min_required: 384,
        max_capacity: 5562,
        unit_cost: 16062.98,
        avg_usage_per_day: 470,
        restock_lead_time: 6,
        vendor_name: "MedSupplies Inc.",
        demand_category: "respiratory_airway"
      },
      {
        item_name: "IV Drip",
        item_type: "Equipment",
        current_stock: 2410,
        min_required: 338,
        max_capacity: 1013,
        unit_cost: 15426.53,
        avg_usage_per_day: 158,
        restock_lead_time: 12,
        vendor_name: "HealthTools Ltd.",
        demand_category: "general"
      },
      {
        item_name: "Gloves",
        item_type: "Equipment",
        current_stock: 2448,
        min_required: 28,
        max_capacity: 1314,
        unit_cost: 2729.08,
        avg_usage_per_day: 418,
        restock_lead_time: 5,
        vendor_name: "EquipMed Co.",
        demand_category: "general"
      },
      {
        item_name: "X-ray Machine",
        item_type: "Consumable",
        current_stock: 3298,
        min_required: 231,
        max_capacity: 3736,
        unit_cost: 10669.37,
        avg_usage_per_day: 244,
        restock_lead_time: 2,
        vendor_name: "MedSupplies Inc.",
        demand_category: "general"
      },
      {
        item_name: "Bandages",
        item_type: "Consumable",
        current_stock: 1850,
        min_required: 500,
        max_capacity: 2500,
        unit_cost: 125.50,
        avg_usage_per_day: 95,
        restock_lead_time: 10,
        vendor_name: "HealthTools Ltd.",
        demand_category: "general"
      },
      {
        item_name: "Syringes",
        item_type: "Consumable",
        current_stock: 2038,
        min_required: 438,
        max_capacity: 1131,
        unit_cost: 744.10,
        avg_usage_per_day: 207,
        restock_lead_time: 15,
        vendor_name: "EquipMed Co.",
        demand_category: "general"
      },
      {
        item_name: "Oxygen Tanks",
        item_type: "Equipment",
        current_stock: 180,
        min_required: 200,
        max_capacity: 500,
        unit_cost: 8500.00,
        avg_usage_per_day: 8,
        restock_lead_time: 20,
        vendor_name: "HealthTools Ltd.",
        demand_category: "respiratory_airway"
      }
    ];

    // Insert inventory items
    const { data: insertedItems, error: inventoryError } = await supabase
      .from("inventory_items")
      .insert(inventoryItems.map((item) => ({ ...item, hospital_id: hospitalId })))
      .select();

    if (inventoryError) {
      console.error("Error inserting inventory:", inventoryError);
      throw inventoryError;
    }

    console.log(`Inserted ${insertedItems?.length} inventory items`);

    // model_registry is global (one shared deployed model, not hospital
    // data), so reuse the existing active row instead of inserting a new
    // "active" one every time any hospital seeds -- that would leave
    // multiple rows simultaneously marked is_active across hospitals.
    let modelData;
    const { data: existingModel } = await supabase
      .from("model_registry")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingModel) {
      modelData = existingModel;
    } else {
      // First-ever seed across all hospitals: insert the real metrics from
      // the last `python3 ml/train.py` run (see ml/models/metrics.json) --
      // these were previously fabricated placeholder numbers. Update this
      // block whenever the model is retrained.
      const { data: insertedModel, error: modelError } = await supabase
        .from("model_registry")
        .insert({
          model_version: "v2.0.0",
          model_type: "LightGBM",
          mae: 124.931,
          rmse: 145.358,
          r2_score: -0.01,
          training_date: new Date().toISOString(),
          is_active: true,
          feature_importance: {
            "Usage_Rolling_7": "highest per-prediction contribution (see ml/models/metrics.json)",
            "Current_Stock": "second highest",
            "Max_Capacity": "notable negative contribution",
          },
          hyperparameters: {
            "note": "RandomizedSearchCV-selected, see ml/models/feature_schema.json for the full trained schema",
          },
          dataset_summary: {
            "total_samples": 495,
            "train_samples": 396,
            "test_samples": 99,
            "source": "ml/data/raw/inventory_data.csv (real dataset, not the notebook's synthetic generator)"
          }
        })
        .select()
        .single();

      if (modelError) {
        console.error("Error inserting model:", modelError);
        throw modelError;
      }
      modelData = insertedModel;
    }

    console.log("Using model registry entry", modelData.model_version);

    // Create predictions for each item
    if (insertedItems && modelData) {
      const predictions = insertedItems.map((item) => {
        const estimatedDemand = item.avg_usage_per_day * item.restock_lead_time;
        const inventoryShortfall = Math.max(0, item.min_required - item.current_stock);
        const replenishmentNeeds = Math.max(0, item.max_capacity - item.current_stock);

        return {
          item_id: item.id,
          hospital_id: hospitalId,
          model_version_id: modelData.id,
          predicted_demand: estimatedDemand,
          // Bootstrap-only estimate (simple formula, not the trained model) so
          // the dashboard has something to show immediately after seeding;
          // confidence_score: 0 and the seed_placeholder flag make that
          // explicit rather than faking a plausible-looking score. Calling
          // run-predictions afterwards replaces these with real model output.
          confidence_score: 0,
          feature_values: {
            avg_usage_per_day: item.avg_usage_per_day,
            restock_lead_time: item.restock_lead_time,
            current_stock: item.current_stock,
            shortfall: inventoryShortfall,
            replenishment_needs: replenishmentNeeds,
            unit_cost: item.unit_cost,
            seed_placeholder: true
          },
          feature_contributions: [
            { name: "Avg_Usage_Per_Day", contribution: 45.0 },
            { name: "Restock_Lead_Time", contribution: 30.0 },
            { name: "Current_Stock", contribution: 15.0 }
          ]
        };
      });

      const { error: predictionError } = await supabase
        .from("prediction_history")
        .insert(predictions);

      if (predictionError) {
        console.error("Error inserting predictions:", predictionError);
        throw predictionError;
      }

      console.log(`Inserted ${predictions.length} predictions`);

      // Also insert into predictions table for dashboard
      const dashboardPredictions = insertedItems.map((item) => {
        const estimatedDemand = item.avg_usage_per_day * item.restock_lead_time;
        const inventoryShortfall = Math.max(0, item.min_required - item.current_stock);
        const replenishmentNeeds = Math.max(0, item.max_capacity - item.current_stock);

        return {
          item_id: item.id,
          hospital_id: hospitalId,
          estimated_demand: estimatedDemand,
          inventory_shortfall: inventoryShortfall,
          replenishment_needs: replenishmentNeeds
        };
      });

      const { error: dashPredError } = await supabase
        .from("predictions")
        .insert(dashboardPredictions);

      if (dashPredError) {
        console.error("Error inserting dashboard predictions:", dashPredError);
        throw dashPredError;
      }

      console.log(`Inserted ${dashboardPredictions.length} dashboard predictions`);
    }

    // alert_configurations is hospital-scoped, so unlike model_registry
    // every hospital needs its own defaults -- seed them here rather than
    // relying on the original (pre-multi-tenancy) migration's one-time
    // global insert, which only ever covered the default hospital.
    const { count: configCount } = await supabase
      .from("alert_configurations")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", hospitalId);

    if (!configCount || configCount === 0) {
      const { error: configError } = await supabase.from("alert_configurations").insert([
        { hospital_id: hospitalId, alert_type: "low_stock", threshold_value: 20, threshold_type: "percentage", notification_channels: ["in_app", "email"] },
        { hospital_id: hospitalId, alert_type: "critical_stock", threshold_value: 10, threshold_type: "percentage", notification_channels: ["in_app", "email"] },
        { hospital_id: hospitalId, alert_type: "expiry_warning", threshold_value: 30, threshold_type: "absolute", notification_channels: ["in_app", "email"] },
        { hospital_id: hospitalId, alert_type: "data_drift", threshold_value: 0.15, threshold_type: "absolute", notification_channels: ["in_app", "email"] },
        { hospital_id: hospitalId, alert_type: "prediction_error", threshold_value: 0.20, threshold_type: "percentage", notification_channels: ["in_app"] },
      ]);
      if (configError) {
        console.error("Error inserting alert configurations:", configError);
        throw configError;
      }
    }

    // Insert sample alerts
    const lowStockItems = insertedItems?.filter(item => item.current_stock < item.min_required) || [];

    if (lowStockItems.length > 0) {
      const alerts = lowStockItems.map((item) => ({
        alert_type: "low_stock",
        severity: item.current_stock < item.min_required * 0.5 ? "critical" : "warning",
        title: `Low Stock Alert: ${item.item_name}`,
        message: `${item.item_name} stock (${item.current_stock}) is below minimum required (${item.min_required})`,
        item_id: item.id,
        hospital_id: hospitalId,
        metadata: {
          current_stock: item.current_stock,
          min_required: item.min_required,
          shortfall: item.min_required - item.current_stock
        }
      }));

      const { error: alertError } = await supabase
        .from("alerts_history")
        .insert(alerts);

      if (alertError) {
        console.error("Error inserting alerts:", alertError);
        throw alertError;
      }

      console.log(`Inserted ${alerts.length} alerts`);
    }

    return jsonResponse({
      success: true,
      message: "Sample data seeded successfully",
      stats: {
        inventory_items: insertedItems?.length || 0,
        predictions: insertedItems?.length || 0,
        alerts: lowStockItems.length
      }
    });
  } catch (error) {
    console.error("Error seeding data:", error);
    const status = error instanceof Error && /unauthorized|missing authorization/i.test(error.message) ? 401 : 500;
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      status
    );
  }
});
