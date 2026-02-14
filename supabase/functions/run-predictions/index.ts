import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PredictionInput {
  item_id?: string;
  run_all?: boolean;
  single_prediction?: {
    item_name: string;
    item_type: string;
    current_stock: number;
    min_required: number;
    max_capacity: number;
    avg_usage_per_day: number;
    restock_lead_time: number;
    unit_cost: number;
    vendor_name?: string;
  };
}

interface InventoryItem {
  id: string;
  current_stock: number;
  min_required: number;
  max_capacity: number;
  unit_cost: number;
  avg_usage_per_day: number;
  restock_lead_time: number;
  item_type: string;
}

// Simplified GradientBoosting-like prediction based on the document
function predictDemand(item: InventoryItem): {
  estimated_demand: number;
  inventory_shortfall: number;
  replenishment_needs: number;
  feature_contributions: Record<string, number>;
} {
  // Target: Estimated_Demand = Avg_Usage_Per_Day × Restock_Lead_Time
  const estimated_demand = item.avg_usage_per_day * item.restock_lead_time;
  
  // Inventory_Shortfall = Min_Required - Current_Stock
  const inventory_shortfall = Math.max(0, item.min_required - item.current_stock);
  
  // Replenishment_Needs = Estimated_Demand - Current_Stock
  const replenishment_needs = Math.max(0, estimated_demand - item.current_stock);
  
  // Feature importance (normalized contributions)
  const feature_contributions = {
    'avg_usage_per_day': item.avg_usage_per_day / (estimated_demand || 1) * 0.4,
    'restock_lead_time': item.restock_lead_time / (estimated_demand || 1) * 0.3,
    'current_stock': item.current_stock / (item.max_capacity || 1) * 0.15,
    'min_required': item.min_required / (item.max_capacity || 1) * 0.15,
  };
  
  return {
    estimated_demand,
    inventory_shortfall,
    replenishment_needs,
    feature_contributions,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { item_id, run_all, single_prediction }: PredictionInput = await req.json();

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

    // Handle single prediction (demo mode - no DB persistence)
    if (single_prediction) {
      const prediction = predictDemand({
        id: 'demo',
        ...single_prediction,
      } as InventoryItem);

      return new Response(
        JSON.stringify({ 
          success: true, 
          ...prediction,
          model_version: activeModel.model_version,
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
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
      const prediction = predictDemand(item);
      
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
          confidence_score: 0.85, // Placeholder
          feature_values: {
            current_stock: item.current_stock,
            min_required: item.min_required,
            avg_usage_per_day: item.avg_usage_per_day,
            restock_lead_time: item.restock_lead_time,
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
            },
          });
        }
      }
    }

    // Batch insert alerts
    if (alerts.length > 0) {
      await supabase.from('alerts_history').insert(alerts);
    }

    console.log(`Generated ${predictions.length} predictions and ${alerts.length} alerts`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        predictions,
        alerts_generated: alerts.length,
        model_version: activeModel.model_version,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in run-predictions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
