import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EOQInput {
  item_id?: string;
  run_all?: boolean;
}

interface InventoryItem {
  id: string;
  item_name: string;
  current_stock: number;
  min_required: number;
  unit_cost: number;
  avg_usage_per_day: number;
  restock_lead_time: number;
}

// Calculate Economic Order Quantity (EOQ)
function calculateEOQ(
  annualDemand: number,
  orderingCost: number,
  holdingCostPerUnit: number
): number {
  return Math.sqrt((2 * annualDemand * orderingCost) / holdingCostPerUnit);
}

// Calculate Reorder Point (ROP)
function calculateReorderPoint(
  dailyDemand: number,
  leadTime: number,
  safetyStock: number
): number {
  return (dailyDemand * leadTime) + safetyStock;
}

// Calculate Safety Stock
function calculateSafetyStock(
  dailyDemand: number,
  leadTime: number,
  serviceLevel: number = 1.65 // 95% service level (Z-score)
): number {
  // Assuming standard deviation is 20% of daily demand
  const demandStdDev = dailyDemand * 0.2;
  const leadTimeStdDev = Math.sqrt(leadTime);
  return serviceLevel * demandStdDev * leadTimeStdDev;
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

    const { item_id, run_all }: EOQInput = await req.json();

    // Get inventory items
    let query = supabase.from('inventory_items').select('*');
    if (!run_all && item_id) {
      query = query.eq('id', item_id);
    }

    const { data: items, error: itemsError } = await query;
    if (itemsError || !items || items.length === 0) {
      throw new Error('No items found');
    }

    const optimizations = [];

    for (const item of items) {
      const annualDemand = item.avg_usage_per_day * 365;
      
      // Estimated costs (can be made configurable)
      const orderingCost = 50; // Cost per order
      const holdingCostRate = 0.25; // 25% of unit cost per year
      const holdingCostPerUnit = item.unit_cost * holdingCostRate;
      
      // Calculate EOQ
      const eoq = calculateEOQ(annualDemand, orderingCost, holdingCostPerUnit);
      
      // Calculate Safety Stock
      const safetyStock = calculateSafetyStock(
        item.avg_usage_per_day,
        item.restock_lead_time
      );
      
      // Calculate Reorder Point
      const reorderPoint = calculateReorderPoint(
        item.avg_usage_per_day,
        item.restock_lead_time,
        safetyStock
      );
      
      // Calculate optimal order quantity (considering max capacity)
      const optimalOrderQty = Math.min(Math.ceil(eoq), item.max_capacity);
      
      // Calculate annual costs
      const numberOfOrders = annualDemand / optimalOrderQty;
      const annualOrderingCost = numberOfOrders * orderingCost;
      const averageInventory = (optimalOrderQty / 2) + safetyStock;
      const annualHoldingCost = averageInventory * holdingCostPerUnit;
      const estimatedAnnualCost = annualOrderingCost + annualHoldingCost + (annualDemand * item.unit_cost);
      
      // Store optimization data
      const { error: insertError } = await supabase
        .from('cost_optimization')
        .insert({
          item_id: item.id,
          eoq: Math.ceil(eoq),
          reorder_point: Math.ceil(reorderPoint),
          safety_stock: Math.ceil(safetyStock),
          optimal_order_quantity: optimalOrderQty,
          estimated_annual_cost: estimatedAnnualCost,
          parameters: {
            annual_demand: annualDemand,
            ordering_cost: orderingCost,
            holding_cost_rate: holdingCostRate,
            holding_cost_per_unit: holdingCostPerUnit,
            number_of_orders: numberOfOrders,
            annual_ordering_cost: annualOrderingCost,
            annual_holding_cost: annualHoldingCost,
          },
        });

      if (!insertError) {
        optimizations.push({
          item_id: item.id,
          item_name: item.item_name,
          eoq: Math.ceil(eoq),
          reorder_point: Math.ceil(reorderPoint),
          safety_stock: Math.ceil(safetyStock),
          optimal_order_quantity: optimalOrderQty,
          estimated_annual_cost: estimatedAnnualCost,
          current_stock: item.current_stock,
          should_reorder: item.current_stock <= reorderPoint,
        });
      }
    }

    console.log(`Generated ${optimizations.length} cost optimizations`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        optimizations,
        total_items: optimizations.length,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in calculate-cost-optimization:', error);
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
