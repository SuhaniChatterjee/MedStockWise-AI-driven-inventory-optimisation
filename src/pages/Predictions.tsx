import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Play, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

interface ModelInfo {
  model_version: string;
  mae: number;
  training_date: string;
  is_active: boolean;
}

interface Prediction {
  item_id: string;
  estimated_demand: number;
  inventory_shortfall: number;
  replenishment_needs: number;
  item_name?: string;
}

export default function Predictions() {
  const [loading, setLoading] = useState(false);
  const [runAll, setRunAll] = useState(true);
  const [selectedItem, setSelectedItem] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchItems();
    fetchModelInfo();
    fetchRecentPredictions();
  }, []);

  const fetchItems = async () => {
    const { data } = await supabase
      .from("inventory_items")
      .select("id, item_name")
      .order("item_name");
    
    if (data) setItems(data);
  };

  const fetchModelInfo = async () => {
    const { data } = await supabase
      .from("model_registry")
      .select("*")
      .eq("is_active", true)
      .single();
    
    if (data) setModelInfo(data);
  };

  const fetchRecentPredictions = async () => {
    const { data } = await supabase
      .from("predictions")
      .select(`
        *,
        inventory_items(item_name)
      `)
      .order("created_at", { ascending: false })
      .limit(10);
    
    if (data) {
      const formattedPredictions = data.map(p => ({
        item_id: p.item_id,
        estimated_demand: p.estimated_demand,
        inventory_shortfall: p.inventory_shortfall,
        replenishment_needs: p.replenishment_needs,
        item_name: (p.inventory_items as any)?.item_name,
      }));
      setPredictions(formattedPredictions);
    }
  };

  const runPredictions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-predictions", {
        body: {
          run_all: runAll,
          item_id: runAll ? undefined : selectedItem,
        },
      });

      if (error) throw error;

      toast({
        title: "Predictions Complete",
        description: `Generated ${data.predictions.length} predictions and ${data.alerts_generated} alerts using model ${data.model_version}`,
      });

      fetchRecentPredictions();
    } catch (error: any) {
      toast({
        title: "Prediction Failed",
        description: error.message || "Failed to run predictions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">AI Demand Predictions</h1>
        <p className="text-muted-foreground mt-2">
          ML-powered forecasting for inventory demand and replenishment needs
        </p>
      </div>

      {modelInfo && (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Active Model: {modelInfo.model_version}
                </CardTitle>
                <CardDescription>
                  GradientBoosting Regressor • MAE: {modelInfo.mae.toFixed(2)}
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-success/10 text-success">
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </Badge>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Run Predictions</CardTitle>
          <CardDescription>
            Generate demand forecasts and identify restocking needs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="run-all"
                checked={runAll}
                onChange={() => setRunAll(true)}
                className="h-4 w-4"
              />
              <label htmlFor="run-all" className="text-sm font-medium">
                Run for all items
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="run-single"
                checked={!runAll}
                onChange={() => setRunAll(false)}
                className="h-4 w-4"
              />
              <label htmlFor="run-single" className="text-sm font-medium">
                Run for specific item
              </label>
            </div>
          </div>

          {!runAll && (
            <Select value={selectedItem} onValueChange={setSelectedItem}>
              <SelectTrigger>
                <SelectValue placeholder="Select an item..." />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.item_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button 
            onClick={runPredictions} 
            disabled={loading || (!runAll && !selectedItem)}
            className="w-full gap-2"
          >
            <Play className="h-4 w-4" />
            {loading ? "Running Predictions..." : "Run Predictions"}
          </Button>
        </CardContent>
      </Card>

      {predictions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Predictions</CardTitle>
            <CardDescription>Latest demand forecasts and restocking recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {predictions.map((pred, idx) => (
                <div key={idx} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{pred.item_name || "Unknown Item"}</h4>
                    {pred.inventory_shortfall > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Shortage Alert
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Est. Demand</p>
                      <p className="font-bold text-lg">{pred.estimated_demand.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Shortage</p>
                      <p className="font-bold text-lg text-destructive">
                        {pred.inventory_shortfall.toFixed(0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">To Restock</p>
                      <p className="font-bold text-lg text-warning">
                        {pred.replenishment_needs.toFixed(0)}
                      </p>
                    </div>
                  </div>

                  {pred.replenishment_needs > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Urgency Level</p>
                      <Progress 
                        value={(pred.inventory_shortfall / pred.estimated_demand) * 100}
                        className="h-2"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
