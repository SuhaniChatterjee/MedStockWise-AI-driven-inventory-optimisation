import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface DemoDataTableProps {
  data: any[];
}

export function DemoDataTable({ data }: DemoDataTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No sample data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Predicted Demand</TableHead>
            <TableHead className="text-right">Shortfall</TableHead>
            <TableHead className="text-right">Restock Needed</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">
                {item.inventory_items?.item_name || "Unknown"}
              </TableCell>
              <TableCell>{item.inventory_items?.item_type || "N/A"}</TableCell>
              <TableCell className="text-right">
                {item.predicted_demand?.toFixed(0) || "N/A"}
              </TableCell>
              <TableCell className="text-right">
                <span className={item.feature_values?.shortfall > 0 ? "text-destructive font-semibold" : ""}>
                  {item.feature_values?.shortfall?.toFixed(0) || "0"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {item.feature_values?.replenishment_needs?.toFixed(0) || "0"}
              </TableCell>
              <TableCell>
                {item.feature_values?.shortfall > 0 ? (
                  <Badge variant="destructive">Low Stock</Badge>
                ) : (
                  <Badge variant="outline">Adequate</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
