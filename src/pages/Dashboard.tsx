import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingDown, AlertTriangle, DollarSign, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface InventoryStats {
  totalItems: number;
  lowStockItems: number;
  totalValue: number;
  criticalItems: number;
}

const EMPTY_STATS: InventoryStats = {
  totalItems: 0,
  lowStockItems: 0,
  totalValue: 0,
  criticalItems: 0,
};

export default function Dashboard() {
  const { isManager } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats = EMPTY_STATS, isLoading } = useQuery({
    queryKey: ["inventory-stats"],
    queryFn: async (): Promise<InventoryStats> => {
      const { data: items, error } = await supabase.from("inventory_items").select("*");
      if (error) throw error;
      if (!items) return EMPTY_STATS;

      return {
        totalItems: items.length,
        lowStockItems: items.filter((item) => item.current_stock < item.min_required).length,
        criticalItems: items.filter((item) => item.current_stock < item.min_required * 0.5).length,
        totalValue: items.reduce(
          (sum, item) => sum + item.current_stock * parseFloat(item.unit_cost.toString()),
          0
        ),
      };
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("seed-sample-data");
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Database Initialized", description: "Sample data has been loaded successfully." });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
    },
    onError: (error) => {
      console.error("Seeding error:", error);
      toast({
        title: "Seeding Failed",
        description: "Could not load sample data. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-seed if the database is empty, once stats have loaded. Seeding
  // requires admin/inventory_manager (the edge function enforces this too)
  // -- nurses just see the empty state until a manager/admin initializes it.
  useEffect(() => {
    if (isLoading || !isManager || seedMutation.isPending) return;
    if (stats.totalItems === 0) {
      seedMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isManager, stats.totalItems]);

  const seeding = seedMutation.isPending;

  const statCards = [
    {
      title: "Total Items",
      value: stats.totalItems,
      icon: Package,
      color: "from-primary to-primary-glow",
    },
    {
      title: "Low Stock Items",
      value: stats.lowStockItems,
      icon: TrendingDown,
      color: "from-warning to-warning/80",
    },
    {
      title: "Critical Items",
      value: stats.criticalItems,
      icon: AlertTriangle,
      color: "from-destructive to-destructive/80",
    },
    {
      title: "Total Stock Value",
      value: `$${stats.totalValue.toFixed(2)}`,
      icon: DollarSign,
      color: "from-success to-success/80",
    },
  ];

  if (isLoading || seeding) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary"></div>
          <div className="absolute inset-0 animate-ping rounded-full h-16 w-16 border-4 border-primary opacity-20"></div>
        </div>
        {seeding && (
          <div className="text-center space-y-2">
            <p className="text-lg font-medium text-foreground">Initializing Database</p>
            <p className="text-sm text-muted-foreground">Loading sample data for your inventory system...</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-lg">
          Real-time overview of your hospital inventory system
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.title}
              className="overflow-hidden card-hover border-none"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2.5 bg-gradient-to-br ${stat.color} rounded-lg shadow-md`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight animate-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: `${index * 150}ms` }}>
                  {stat.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Quick Actions</CardTitle>
          <CardDescription className="text-base">
            Common tasks to manage your inventory efficiently
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Link
              to="/inventory"
              className="group p-6 border rounded-xl hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            >
              <div className="space-y-3">
                <div className="p-3 bg-primary/10 rounded-lg w-fit group-hover:bg-primary/20 transition-colors">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">View Inventory</h3>
                <p className="text-sm text-muted-foreground">
                  Browse and manage all inventory items
                </p>
              </div>
            </Link>
            <Link
              to="/predictions"
              className="group p-6 border rounded-xl hover:border-secondary/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            >
              <div className="space-y-3">
                <div className="p-3 bg-secondary/10 rounded-lg w-fit group-hover:bg-secondary/20 transition-colors">
                  <TrendingUp className="h-6 w-6 text-secondary" />
                </div>
                <h3 className="font-semibold text-lg">Run Predictions</h3>
                <p className="text-sm text-muted-foreground">
                  Demand estimates and shortage-risk scoring
                </p>
              </div>
            </Link>
            <Link
              to="/alerts"
              className="group p-6 border rounded-xl hover:border-warning/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            >
              <div className="space-y-3">
                <div className="p-3 bg-warning/10 rounded-lg w-fit group-hover:bg-warning/20 transition-colors">
                  <AlertTriangle className="h-6 w-6 text-warning" />
                </div>
                <h3 className="font-semibold text-lg">Low Stock Alerts</h3>
                <p className="text-sm text-muted-foreground">
                  Items requiring immediate attention
                </p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
