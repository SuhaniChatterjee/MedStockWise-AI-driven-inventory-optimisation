import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingDown, Package, AlertTriangle, Play, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { exportToCsv } from "@/lib/csv-export";

interface CostOptimization {
  id: string;
  item_id: string | null;
  eoq: number | null;
  reorder_point: number | null;
  safety_stock: number | null;
  optimal_order_quantity: number | null;
  estimated_annual_cost: number | null;
  calculation_date: string;
  item_name?: string;
  current_stock?: number;
  should_reorder?: boolean;
}

export default function CostOptimization() {
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [optimizations, setOptimizations] = useState<CostOptimization[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchOptimizations();
  }, []);

  const fetchOptimizations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cost_optimization")
      .select(`
        *,
        inventory_items(item_name, current_stock)
      `)
      .order("calculation_date", { ascending: false });

    if (data) {
      const formatted = data.map((opt) => {
        const joinedItem = opt.inventory_items as { item_name: string; current_stock: number } | null;
        return {
          ...opt,
          item_name: joinedItem?.item_name,
          current_stock: joinedItem?.current_stock,
          should_reorder:
            opt.reorder_point != null &&
            joinedItem?.current_stock != null &&
            joinedItem.current_stock <= opt.reorder_point,
        };
      });
      setOptimizations(formatted);
    }
    setLoading(false);
  };

  const runCalculations = async () => {
    setCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke("calculate-cost-optimization", {
        body: { run_all: true },
      });

      if (error) throw error;

      toast({
        title: "Calculations Complete",
        description: `Generated cost optimization for ${data.total_items} items`,
      });

      fetchOptimizations();
    } catch (error) {
      toast({
        title: "Calculation Failed",
        description: error instanceof Error ? error.message : "Failed to calculate cost optimization",
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
  };

  const totalAnnualCost = optimizations.reduce((sum, opt) => sum + Number(opt.estimated_annual_cost), 0);
  const itemsNeedingReorder = optimizations.filter(opt => opt.should_reorder).length;

  const handleExport = () => {
    exportToCsv(
      `cost-optimization-${new Date().toISOString().slice(0, 10)}`,
      optimizations.map((opt) => ({
        item_name: opt.item_name ?? "Unknown",
        current_stock: opt.current_stock ?? "",
        eoq: opt.eoq ?? "",
        reorder_point: opt.reorder_point ?? "",
        safety_stock: opt.safety_stock ?? "",
        optimal_order_quantity: opt.optimal_order_quantity ?? "",
        estimated_annual_cost: opt.estimated_annual_cost ?? "",
        should_reorder: opt.should_reorder ?? false,
        calculation_date: opt.calculation_date,
      }))
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Cost Optimization</h1>
        <p className="text-muted-foreground mt-2">
          EOQ analysis and reorder point calculations for inventory management
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Annual Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${totalAnnualCost.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Items Analyzed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{optimizations.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reorder Needed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">{itemsNeedingReorder}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run Cost Optimization</CardTitle>
          <CardDescription>
            Calculate Economic Order Quantity (EOQ) and optimal reorder points for all items
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={runCalculations} 
            disabled={calculating}
            className="w-full gap-2"
          >
            <Play className="h-4 w-4" />
            {calculating ? "Calculating..." : "Run Cost Optimization"}
          </Button>
        </CardContent>
      </Card>

      {optimizations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Optimization Results</h2>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
          {optimizations.map((opt) => (
            <Card key={opt.id} className={opt.should_reorder ? "border-warning" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{opt.item_name || "Unknown Item"}</CardTitle>
                    <CardDescription>
                      Current Stock: {opt.current_stock} units
                    </CardDescription>
                  </div>
                  {opt.should_reorder && (
                    <Badge variant="outline" className="bg-warning/10 text-warning gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Reorder Now
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">EOQ</p>
                    <p className="text-2xl font-bold flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      {opt.eoq}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Reorder Point</p>
                    <p className="text-2xl font-bold flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-warning" />
                      {opt.reorder_point}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Safety Stock</p>
                    <p className="text-2xl font-bold">{opt.safety_stock}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Optimal Qty</p>
                    <p className="text-2xl font-bold">{opt.optimal_order_quantity}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Annual Cost</p>
                    <p className="text-2xl font-bold flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-success" />
                      {(opt.estimated_annual_cost ?? 0).toFixed(0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
