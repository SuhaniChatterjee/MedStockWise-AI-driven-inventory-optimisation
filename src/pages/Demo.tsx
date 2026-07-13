import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Play, Download, TrendingUp, AlertCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CSVUploadWizard, CSVPredictionResult } from "@/components/demo/CSVUploadWizard";
import { SingleRowTest } from "@/components/demo/SingleRowTest";
import { DemoDataTable, DemoResultRow } from "@/components/demo/DemoDataTable";
import { ModelMetrics } from "@/components/demo/ModelMetrics";
import { PredictionChart } from "@/components/demo/PredictionChart";

interface ModelInfo {
  model_version: string;
  model_type: string;
  mae: number;
  rmse: number | null;
  r2_score: number | null;
  training_date: string;
  feature_importance: Record<string, unknown> | null;
}

export default function Demo() {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [sampleData, setSampleData] = useState<DemoResultRow[]>([]);
  const [batchResults, setBatchResults] = useState<CSVPredictionResult[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchModelInfo();
    fetchSampleData();
  }, []);

  const fetchModelInfo = async () => {
    const { data } = await supabase
      .from("model_registry")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    
    // Supabase's generated types represent jsonb columns as the generic
    // `Json` union, which is more conservative than the actual known shape
    // written by ml/train.py + seed-sample-data. Cast once at this DB
    // boundary rather than loosening ModelInfo/DemoResultRow throughout.
    if (data && data.length > 0) setModelInfo(data[0] as unknown as ModelInfo);
  };

  const fetchSampleData = async () => {
    const { data } = await supabase
      .from("prediction_history")
      .select(`
        *,
        inventory_items(item_name, item_type)
      `)
      .order("created_at", { ascending: false })
      .limit(20);
    
    if (data) setSampleData(data as unknown as DemoResultRow[]);
  };

  const downloadTemplate = () => {
    const template = `item_name,item_type,current_stock,min_required,max_capacity,avg_usage_per_day,restock_lead_time,unit_cost,vendor_name
Surgical Gloves,Consumable,500,200,1000,50,7,2.50,MedSupply Inc
Syringes 10ml,Consumable,300,150,800,40,5,1.20,HealthCare Co
Ventilator,Equipment,200,100,500,25,10,3000.00,SafetyFirst Ltd`;

    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_template.csv";
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Template Downloaded",
      description: "Use this CSV template to format your hospital inventory data",
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Try the Model - Demo</h1>
          <p className="text-muted-foreground mt-2">
            Preview how our AI-powered demand forecasting works with sample data or upload your own
          </p>
        </div>
        <Button onClick={downloadTemplate} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <CardTitle className="text-lg">About This Model</CardTitle>
              <CardDescription className="mt-2">
                This demo calls the same prediction service the live app uses (see{" "}
                <code className="text-xs">services/prediction-api</code>), which serves the trained model
                from <code className="text-xs">ml/train.py</code>. Predictions are based on historical
                usage patterns, lead times, and stock levels, with real per-prediction feature
                contributions shown for transparency.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {modelInfo && (
        <ModelMetrics
          modelVersion={modelInfo.model_version}
          modelType={modelInfo.model_type}
          mae={modelInfo.mae}
          rmse={modelInfo.rmse ?? undefined}
          r2Score={modelInfo.r2_score ?? undefined}
          trainingDate={modelInfo.training_date}
          featureImportance={modelInfo.feature_importance ?? undefined}
        />
      )}

      <Tabs defaultValue="quick-test" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="quick-test">Quick Test</TabsTrigger>
          <TabsTrigger value="sample-data">Sample Data</TabsTrigger>
          <TabsTrigger value="upload">Upload CSV</TabsTrigger>
          <TabsTrigger value="results">Prediction Results</TabsTrigger>
        </TabsList>

        <TabsContent value="quick-test" className="space-y-4">
          <SingleRowTest />
        </TabsContent>

        <TabsContent value="sample-data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sample Predictions</CardTitle>
              <CardDescription>
                Recent predictions from our demo dataset showing actual model outputs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DemoDataTable data={sampleData} />
            </CardContent>
          </Card>

          <PredictionChart data={sampleData} />
        </TabsContent>

        <TabsContent value="upload" className="space-y-4">
          <CSVUploadWizard onPredictionsComplete={setBatchResults} />
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Batch Prediction Results</CardTitle>
              <CardDescription>
                View and export predictions from your uploaded CSV files
              </CardDescription>
            </CardHeader>
            <CardContent>
              {batchResults.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {batchResults.length} predictions generated
                    </Badge>
                  </div>
                  <DemoDataTable data={batchResults} />
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Upload a CSV file to see batch prediction results here</p>
                  <p className="text-sm mt-2">Go to the "Upload CSV" tab to get started</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
