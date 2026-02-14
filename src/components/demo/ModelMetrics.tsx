import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Target, Activity, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ModelMetricsProps {
  modelVersion: string;
  mae: number;
  rmse?: number;
  r2Score?: number;
  trainingDate: string;
  featureImportance?: any;
}

export function ModelMetrics({ 
  modelVersion, 
  mae, 
  rmse, 
  r2Score, 
  trainingDate,
  featureImportance 
}: ModelMetricsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Model Version</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{modelVersion}</div>
          <Badge variant="outline" className="mt-2">GradientBoosting</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Mean Absolute Error</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{mae.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground mt-2">
            Average prediction error
          </p>
        </CardContent>
      </Card>

      {rmse && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">RMSE</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rmse.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Root Mean Squared Error
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Training Date</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-sm font-bold">
            {new Date(trainingDate).toLocaleDateString()}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Last model update
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
