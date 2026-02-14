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
import { CSVUploadWizard } from "@/components/demo/CSVUploadWizard";
import { SingleRowTest } from "@/components/demo/SingleRowTest";
import { DemoDataTable } from "@/components/demo/DemoDataTable";
import { ModelMetrics } from "@/components/demo/ModelMetrics";
import { PredictionChart } from "@/components/demo/PredictionChart";

export default function Demo() {
  const [modelInfo, setModelInfo] = useState<any>(null);
  const [sampleData, setSampleData] = useState<any[]>([]);
  const [batchResults, setBatchResults] = useState<any[]>([]);
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
    
    if (data && data.length > 0) setModelInfo(data[0]);
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
    
    if (data) setSampleData(data);
  };

  const downloadTemplate = () => {
    const template = `item_name,item_type,current_stock,min_required,max_capacity,avg_usage_per_day,restock_lead_time,unit_cost,vendor_name
Surgical Gloves,PPE,500,200,1000,50,7,2.50,MedSupply Inc
Syringes 10ml,Medical Supplies,300,150,800,40,5,1.20,HealthCare Co
N95 Masks,PPE,200,100,500,25,10,3.00,SafetyFirst Ltd`;

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
                This demo uses the exact preprocessing and model logic from our GradientBoosting regressor.
                The model predicts inventory demand based on historical usage patterns, lead times, and stock levels.
                All predictions show feature importance and explainability for transparency.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {modelInfo && (
        <ModelMetrics 
          modelVersion={modelInfo.model_version}
          mae={modelInfo.mae}
          rmse={modelInfo.rmse}
          r2Score={modelInfo.r2_score}
          trainingDate={modelInfo.training_date}
          featureImportance={modelInfo.feature_importance}
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
