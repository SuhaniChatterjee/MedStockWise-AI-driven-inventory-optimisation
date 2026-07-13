import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, Info, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Alert {
  id: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  item_id: string | null;
}

export default function Alerts() {
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts", filter],
    queryFn: async (): Promise<Alert[]> => {
      let query = supabase.from("alerts_history").select("*").order("created_at", { ascending: false });
      if (filter === "unread") {
        query = query.eq("is_read", false);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data as Alert[]) ?? [];
    },
  });

  // Subscribed once (not re-subscribed per filter change, unlike the
  // previous implementation) -- invalidating the "alerts" query key
  // refetches whichever filter is currently active.
  useEffect(() => {
    const channel = supabase
      .channel("alerts-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts_history" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["alerts"] });
          toast({ title: "New Alert", description: "A new alert has been received" });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alerts_history").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unreadIds = alerts.filter((a) => !a.is_read).map((a) => a.id);
      const { error } = await supabase.from("alerts_history").update({ is_read: true }).in("id", unreadIds);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "All alerts marked as read" });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      default:
        return <Info className="h-5 w-5 text-primary" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "warning":
        return "bg-warning/10 text-warning border-warning/20";
      default:
        return "bg-primary/10 text-primary border-primary/20";
    }
  };

  const unreadCount = alerts.filter((a) => !a.is_read).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Alerts & Notifications</h1>
          <p className="text-muted-foreground mt-2">
            System alerts and inventory warnings
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending}
            variant="outline"
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Mark All as Read ({unreadCount})
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant={filter === "unread" ? "default" : "outline"}
          onClick={() => setFilter("unread")}
        >
          Unread ({unreadCount})
        </Button>
        <Button
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          All Alerts ({alerts.length})
        </Button>
      </div>

      <div className="space-y-4">
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No {filter === "unread" ? "unread " : ""}alerts found</p>
            </CardContent>
          </Card>
        ) : (
          alerts.map((alert) => (
            <Card
              key={alert.id}
              className={`${!alert.is_read ? "border-l-4" : ""} ${getSeverityColor(alert.severity)}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    {getSeverityIcon(alert.severity)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg">{alert.title}</CardTitle>
                        {!alert.is_read && (
                          <Badge variant="secondary" className="text-xs">New</Badge>
                        )}
                      </div>
                      <CardDescription className="text-sm">
                        {alert.message}
                      </CardDescription>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  {!alert.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAsReadMutation.mutate(alert.id)}
                      disabled={markAsReadMutation.isPending}
                      className="gap-2"
                    >
                      <Check className="h-4 w-4" />
                      Mark Read
                    </Button>
                  )}
                </div>
              </CardHeader>
              {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                <CardContent>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium mb-2">Details:</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(alert.metadata).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-muted-foreground">{key}: </span>
                          <span className="font-medium">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
