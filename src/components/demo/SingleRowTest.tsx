import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Copy, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export function SingleRowTest() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [formData, setFormData] = useState({
    item_name: "Surgical Gloves (Size M)",
    item_type: "PPE",
    current_stock: "450",
    min_required: "200",
    max_capacity: "1000",
    avg_usage_per_day: "55",
    restock_lead_time: "7",
    unit_cost: "2.50",
    vendor_name: "MedSupply Inc"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("run-predictions", {
        body: {
          run_all: false,
          single_prediction: {
            ...formData,
            current_stock: parseInt(formData.current_stock),
            min_required: parseInt(formData.min_required),
            max_capacity: parseInt(formData.max_capacity),
            avg_usage_per_day: parseInt(formData.avg_usage_per_day),
            restock_lead_time: parseInt(formData.restock_lead_time),
            unit_cost: parseFloat(formData.unit_cost)
          }
        }
      });

      if (error) throw error;

      setResult(data);
      toast({
        title: "Prediction Complete",
        description: "Single row prediction processed successfully",
      });
    } catch (error: any) {
      toast({
        title: "Prediction Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyAPIRequest = () => {
    const apiRequest = {
      endpoint: "/functions/v1/run-predictions",
      method: "POST",
      body: {
        run_all: false,
        single_prediction: formData
      }
    };
    
    navigator.clipboard.writeText(JSON.stringify(apiRequest, null, 2));
    toast({
      title: "Copied to Clipboard",
      description: "API request payload copied",
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Try One Item
          </CardTitle>
          <CardDescription>
            Test the model with a single inventory item (fields auto-populated with example values)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item_name">Item Name</Label>
                <Input
                  id="item_name"
                  value={formData.item_name}
                  onChange={(e) => setFormData({...formData, item_name: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item_type">Item Type</Label>
                <Select 
                  value={formData.item_type}
                  onValueChange={(value) => setFormData({...formData, item_type: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PPE">PPE</SelectItem>
                    <SelectItem value="Medical Supplies">Medical Supplies</SelectItem>
                    <SelectItem value="Pharmaceuticals">Pharmaceuticals</SelectItem>
                    <SelectItem value="Equipment">Equipment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="current_stock">Current Stock</Label>
                <Input
                  id="current_stock"
                  type="number"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({...formData, current_stock: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="min_required">Min Required</Label>
                <Input
                  id="min_required"
                  type="number"
                  value={formData.min_required}
                  onChange={(e) => setFormData({...formData, min_required: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_capacity">Max Capacity</Label>
                <Input
                  id="max_capacity"
                  type="number"
                  value={formData.max_capacity}
                  onChange={(e) => setFormData({...formData, max_capacity: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="avg_usage_per_day">Avg Usage/Day</Label>
                <Input
                  id="avg_usage_per_day"
                  type="number"
                  value={formData.avg_usage_per_day}
                  onChange={(e) => setFormData({...formData, avg_usage_per_day: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="restock_lead_time">Lead Time (days)</Label>
                <Input
                  id="restock_lead_time"
                  type="number"
                  value={formData.restock_lead_time}
                  onChange={(e) => setFormData({...formData, restock_lead_time: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit_cost">Unit Cost ($)</Label>
                <Input
                  id="unit_cost"
                  type="number"
                  step="0.01"
                  value={formData.unit_cost}
                  onChange={(e) => setFormData({...formData, unit_cost: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor_name">Vendor Name</Label>
              <Input
                id="vendor_name"
                value={formData.vendor_name}
                onChange={(e) => setFormData({...formData, vendor_name: e.target.value})}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="flex-1 gap-2">
                <Play className="h-4 w-4" />
                {loading ? "Processing..." : "Run Prediction"}
              </Button>
              <Button type="button" variant="outline" onClick={copyAPIRequest}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Prediction Result</CardTitle>
            <CardDescription>Model output with explainability</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Estimated Demand</p>
                <p className="text-2xl font-bold text-primary">{result.estimated_demand?.toFixed(0)}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Inventory Shortfall</p>
                <p className="text-2xl font-bold text-destructive">{result.inventory_shortfall?.toFixed(0)}</p>
              </div>
              <div className="p-4 border rounded-lg col-span-2">
                <p className="text-sm text-muted-foreground">Replenishment Needs</p>
                <p className="text-2xl font-bold text-warning">{result.replenishment_needs?.toFixed(0)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Top Contributing Features
              </h4>
              <div className="space-y-2">
                {result.feature_contributions && Object.entries(result.feature_contributions)
                  .map(([name, value]) => ({
                    name: name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                    contribution: (value as number) * 100
                  }))
                  .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
                  .slice(0, 3)
                  .map((feature, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{feature.name}</span>
                        <Badge variant="outline">{feature.contribution.toFixed(2)}%</Badge>
                      </div>
                      <Progress value={Math.abs(feature.contribution)} className="h-2" />
                    </div>
                  ))}
              </div>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs font-mono overflow-auto max-h-40">
                {JSON.stringify(result, null, 2)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
