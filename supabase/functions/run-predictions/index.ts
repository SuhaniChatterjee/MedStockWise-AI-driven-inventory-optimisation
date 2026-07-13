import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceRoleClient, requireUser, userHasAnyRole } from "../_shared/auth.ts";
import { itemLikeSchema, parseOrError, uuidSchema } from "../_shared/validation.ts";
import { sendAlertEmails } from "../_shared/email.ts";

const predictionInputSchema = z.object({
  item_id: uuidSchema.optional(),
  run_all: z.boolean().optional(),
  single_prediction: itemLikeSchema.optional(),
});

type ItemLike = z.infer<typeof itemLikeSchema>;

interface InventoryItem extends ItemLike {
  id: string;
}

interface PredictionResult {
  estimated_demand: number;
  inventory_shortfall: number;
  replenishment_needs: number;
  feature_contributions: Record<string, number>;
  confidence: number;
  shortage_risk: boolean | null;
  model_source: "ml_service" | "fallback_formula";
}

const PREDICTION_API_URL = Deno.env.get("PREDICTION_API_URL");
const PREDICTION_API_KEY = Deno.env.get("PREDICTION_API_KEY");

// Fallback used when the ML service is unset/unreachable, so the app keeps
// working (with a clearly-labeled degraded estimate) rather than failing
// outright. See services/prediction-api/README.md for deploying the model.
function predictWithFallbackFormula(item: ItemLike): PredictionResult {
  const estimated_demand = item.avg_usage_per_day * item.restock_lead_time;
  const inventory_shortfall = Math.max(0, item.min_required - item.current_stock);
  const replenishment_needs = Math.max(0, estimated_demand - item.current_stock);

  const feature_contributions = {
    avg_usage_per_day: (item.avg_usage_per_day / (estimated_demand || 1)) * 0.4,
    restock_lead_time: (item.restock_lead_time / (estimated_demand || 1)) * 0.3,
    current_stock: (item.current_stock / (item.max_capacity || 1)) * 0.15,
    min_required: (item.min_required / (item.max_capacity || 1)) * 0.15,
  };

  return {
    estimated_demand,
    inventory_shortfall,
    replenishment_needs,
    feature_contributions,
    confidence: 0,
    shortage_risk: null,
    model_source: "fallback_formula",
  };
}

async function fetchHistory(supabase: SupabaseClient, itemId: string) {
  const { data } = await supabase
    .from("usage_observations")
    .select("observed_at, avg_usage_per_day")
    .eq("item_id", itemId)
    .order("observed_at", { ascending: false })
    .limit(10);

  return (data ?? []).reverse().map((row) => ({
    observed_at: row.observed_at,
    avg_usage_per_day: Number(row.avg_usage_per_day),
  }));
}

async function predictWithMlService(
  item: ItemLike,
  history: { observed_at: string; avg_usage_per_day: number }[]
): Promise<PredictionResult> {
  if (!PREDICTION_API_URL) {
    throw new Error("PREDICTION_API_URL not configured");
  }

  const response = await fetch(`${PREDICTION_API_URL}/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(PREDICTION_API_KEY ? { "X-API-Key": PREDICTION_API_KEY } : {}),
    },
    body: JSON.stringify({
      current_stock: item.current_stock,
      min_required: item.min_required,
      max_capacity: item.max_capacity,
      unit_cost: item.unit_cost,
      avg_usage_per_day: item.avg_usage_per_day,
      restock_lead_time: item.restock_lead_time,
      item_type: item.item_type,
      item_name: item.item_name,
      history,
    }),
  });

  if (!response.ok) {
    throw new Error(`Prediction service returned ${response.status}`);
  }

  const result = await response.json();

  return {
    estimated_demand: result.estimated_demand,
    inventory_shortfall: result.inventory_shortfall,
    replenishment_needs: result.replenishment_needs,
    feature_contributions: result.feature_contributions,
    confidence: result.model_confidence,
    shortage_risk: result.shortage_risk,
    model_source: "ml_service",
  };
}

async function predictItem(
  item: ItemLike,
  history: { observed_at: string; avg_usage_per_day: number }[]
): Promise<PredictionResult> {
  try {
    return await predictWithMlService(item, history);
  } catch (error) {
    console.warn("ML service unavailable, using fallback formula:", error instanceof Error ? error.message : error);
    return predictWithFallbackFormula(item);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceRoleClient();
    const user = await requireUser(supabase, req);

    const parsed = parseOrError(predictionInputSchema, await req.json());
    if (!parsed.success) {
      return jsonResponse({ error: `Invalid request: ${parsed.message}` }, 400);
    }
    const { item_id, run_all, single_prediction } = parsed.data;

    // Persisting predictions (run_all / item_id) is an inventory_manager+
    // action; the stateless single_prediction demo calculator stays open
    // to any authenticated user since it never writes to the database.
    if (!single_prediction) {
      const authorized = await userHasAnyRole(supabase, user.id, ["admin", "inventory_manager"]);
      if (!authorized) {
        return jsonResponse({ error: "Only admins or inventory managers can run predictions" }, 403);
      }
    }

    // Get active model version (get the most recent one if multiple exist)
    const { data: activeModels, error: modelError } = await supabase
      .from('model_registry')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (modelError || !activeModels || activeModels.length === 0) {
      throw new Error('No active model found');
    }

    const activeModel = activeModels[0];

    // Handle single prediction (demo mode - no DB persistence, no history)
    if (single_prediction) {
      const prediction = await predictItem(single_prediction, []);

      return jsonResponse({
        success: true,
        ...prediction,
        model_version: activeModel.model_version,
      });
    }

    // Get inventory items
    let query = supabase.from('inventory_items').select('*');
    if (!run_all && item_id) {
      query = query.eq('id', item_id);
    }

    const { data: items, error: itemsError } = await query;
    if (itemsError || !items || items.length === 0) {
      throw new Error('No items found');
    }

    const predictions = [];
    const alerts = [];

    for (const item of items) {
      const history = await fetchHistory(supabase, item.id);
      const prediction = await predictItem(item, history);

      // Record this observation so future predictions for this item have
      // real history to compute lag/rolling features from.
      await supabase.from('usage_observations').insert({
        item_id: item.id,
        avg_usage_per_day: item.avg_usage_per_day,
        current_stock: item.current_stock,
      });

      // Store prediction
      const { data: predictionData, error: predError } = await supabase
        .from('predictions')
        .insert({
          item_id: item.id,
          estimated_demand: prediction.estimated_demand,
          replenishment_needs: prediction.replenishment_needs,
          inventory_shortfall: prediction.inventory_shortfall,
          predicted_by: user.id,
        })
        .select()
        .single();

      if (!predError && predictionData) {
        // Store detailed prediction history
        await supabase.from('prediction_history').insert({
          item_id: item.id,
          model_version_id: activeModel.id,
          predicted_demand: prediction.estimated_demand,
          confidence_score: prediction.confidence,
          feature_values: {
            current_stock: item.current_stock,
            min_required: item.min_required,
            avg_usage_per_day: item.avg_usage_per_day,
            restock_lead_time: item.restock_lead_time,
            model_source: prediction.model_source,
            history_points_used: history.length,
          },
          feature_contributions: prediction.feature_contributions,
          created_by: user.id,
        });

        predictions.push({
          item_id: item.id,
          ...prediction,
        });

        // Generate alerts based on thresholds
        const stockPercentage = (item.current_stock / item.min_required) * 100;

        if (stockPercentage < 10) {
          alerts.push({
            alert_type: 'critical_stock',
            severity: 'critical',
            title: `Critical Stock Alert: ${item.item_name}`,
            message: `Item is at ${stockPercentage.toFixed(1)}% of minimum required. Immediate action needed.`,
            item_id: item.id,
            metadata: {
              current_stock: item.current_stock,
              min_required: item.min_required,
              predicted_demand: prediction.estimated_demand,
              model_shortage_risk: prediction.shortage_risk,
            },
          });
        } else if (stockPercentage < 20) {
          alerts.push({
            alert_type: 'low_stock',
            severity: 'warning',
            title: `Low Stock Warning: ${item.item_name}`,
            message: `Item is at ${stockPercentage.toFixed(1)}% of minimum required. Consider restocking soon.`,
            item_id: item.id,
            metadata: {
              current_stock: item.current_stock,
              min_required: item.min_required,
              predicted_demand: prediction.estimated_demand,
              model_shortage_risk: prediction.shortage_risk,
            },
          });
        }
      }
    }

    // Batch insert alerts
    if (alerts.length > 0) {
      await supabase.from('alerts_history').insert(alerts);
      await sendAlertEmails(supabase, alerts);
    }

    console.log(`Generated ${predictions.length} predictions and ${alerts.length} alerts`);

    return jsonResponse({
      success: true,
      predictions,
      alerts_generated: alerts.length,
      model_version: activeModel.model_version,
    });
  } catch (error) {
    console.error('Error in run-predictions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const status = /unauthorized|missing authorization/i.test(errorMessage) ? 401 : 500;
    return jsonResponse({ error: errorMessage }, status);
  }
});
