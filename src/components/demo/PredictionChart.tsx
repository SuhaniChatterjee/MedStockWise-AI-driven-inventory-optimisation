import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface PredictionChartProps {
  data: any[];
}

export function PredictionChart({ data }: PredictionChartProps) {
  const chartData = data.slice(0, 10).map((item, idx) => ({
    name: item.inventory_items?.item_name?.substring(0, 15) || `Item ${idx + 1}`,
    predicted: item.predicted_demand || 0,
    actual: item.feature_values?.actual_usage || item.predicted_demand * 0.9,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Predicted vs Actual Demand</CardTitle>
        <CardDescription>
          Model accuracy visualization from recent predictions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="predicted" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              name="Predicted Demand"
            />
            <Line 
              type="monotone" 
              dataKey="actual" 
              stroke="hsl(var(--secondary))" 
              strokeWidth={2}
              name="Actual Usage"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
