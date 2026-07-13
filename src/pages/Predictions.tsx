import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Play, AlertCircle, CheckCircle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToCsv } from "@/lib/csv-export";
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
  model_type: string;
  mae: number;
  training_date: string;
  is_active: boolean | null;
}

interface Prediction {
  item_id: string;
  estimated_demand: number;
  inventory_shortfall: number;
  replenishment_needs: number;
  item_name?: string;
}

interface InventoryItemOption {
  id: string;
  item_name: string;
}

export default function Predictions() {
  const [runAll, setRunAll] = useState(true);
  const [selectedItem, setSelectedItem] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["inventory-item-options"],
    queryFn: async (): Promise<InventoryItemOption[]> => {
      const { data, error } = await supabase.from("inventory_items").select("id, item_name").order("item_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: modelInfo = null } = useQuery({
    queryKey: ["active-model-info"],
    queryFn: async (): Promise<ModelInfo | null> => {
      // .single() errors if there's no active model row (or more than one)
      // -- treated as "no model info to show" rather than a page-level
      // failure, matching the previous implementation's graceful fallback.
      const { data } = await supabase
        .from("model_registry")
        .select("*")
        .eq("is_active", true)
        .single();
      return data;
    },
  });

  const { data: predictions = [] } = useQuery({
    queryKey: ["recent-predictions"],
    queryFn: async (): Promise<Prediction[]> => {
      const { data, error } = await supabase
        .from("predictions")
        .select(`*, inventory_items(item_name)`)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;

      return (data ?? []).map((p) => {
        const joinedItem = p.inventory_items as { item_name: string } | null;
        return {
          item_id: p.item_id,
          estimated_demand: p.estimated_demand,
          inventory_shortfall: p.inventory_shortfall,
          replenishment_needs: p.replenishment_needs,
          item_name: joinedItem?.item_name,
        };
      });
    },
  });

  const runPredictionsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("run-predictions", {
        body: { run_all: runAll, item_id: runAll ? undefined : selectedItem },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Predictions Complete",
        description: `Generated ${data.predictions.length} predictions and ${data.alerts_generated} alerts using model ${data.model_version}`,
      });
      queryClient.invalidateQueries({ queryKey: ["recent-predictions"] });
    },
    onError: (error) => {
      toast({
        title: "Prediction Failed",
        description: error instanceof Error ? error.message : "Failed to run predictions",
        variant: "destructive",
      });
    },
  });

  const handleExport = () => {
    exportToCsv(
      `predictions-${new Date().toISOString().slice(0, 10)}`,
      predictions.map((p) => ({
        item_name: p.item_name ?? "Unknown",
        estimated_demand: p.estimated_demand,
        inventory_shortfall: p.inventory_shortfall,
        replenishment_needs: p.replenishment_needs,
      }))
    );
  };

  const loading = runPredictionsMutation.isPending;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Demand Predictions</h1>
        <p className="text-muted-foreground mt-2">
          Model-assisted demand estimates and restocking guidance
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
                  {modelInfo.model_type} • MAE: {modelInfo.mae.toFixed(2)}
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-success/10 text-success">
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Estimates are directional, not a guarantee -- treat them alongside your own judgement.
              Accuracy improves over time as more real usage history is recorded per item.
            </p>
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
            onClick={() => runPredictionsMutation.mutate()}
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Predictions</CardTitle>
                <CardDescription>Latest demand forecasts and restocking recommendations</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
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
