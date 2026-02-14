import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Database, Download } from "lucide-react";

interface Profile {
  id: string;
  full_name: string;
  email: string;
}

interface UserWithRole extends Profile {
  role: string | null;
}

export default function Admin() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("*");

    if (profileError) {
      toast({
        title: "Error",
        description: profileError.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const usersWithRoles = await Promise.all(
      profiles.map(async (profile) => {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.id)
          .single();

        return {
          ...profile,
          role: roleData?.role || null,
        };
      })
    );

    setUsers(usersWithRoles);
    setLoading(false);
  };

  const handleRoleChange = async (userId: string, newRole: "admin" | "inventory_manager" | "nurse") => {
    // First, delete existing role
    await supabase.from("user_roles").delete().eq("user_id", userId);

    // Then insert new role
    const { error } = await supabase
      .from("user_roles")
      .insert([{ user_id: userId, role: newRole }]);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "User role updated successfully",
      });
      fetchUsers();
    }
  };

  const handleSeedData = async () => {
    setSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke("seed-sample-data");
      
      if (error) throw error;

      toast({
        title: "Data Seeded Successfully",
        description: `Added ${data.stats.inventory_items} items, ${data.stats.predictions} predictions, and ${data.stats.alerts} alerts`,
      });
    } catch (error: any) {
      toast({
        title: "Seeding Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSeeding(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md">
          <CardHeader>
            <Shield className="h-12 w-12 mx-auto text-destructive mb-4" />
            <CardTitle className="text-center">Access Denied</CardTitle>
            <CardDescription className="text-center">
              You don't have permission to access this page
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-muted-foreground mt-2">
          Manage users and system settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Seed the database with sample data from the PBL Project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold">Load Sample Dataset</h4>
                <p className="text-sm text-muted-foreground">
                  Populate the database with inventory items, predictions, and model metrics from the PBL Project PDF.
                  Includes 8 inventory items, model v1.0.0 with MAE: 157.17, and sample predictions.
                </p>
              </div>
            </div>
            <Button onClick={handleSeedData} disabled={seeding} className="w-full gap-2">
              <Download className="h-4 w-4" />
              {seeding ? "Seeding Data..." : "Seed Sample Data"}
            </Button>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-semibold mb-2">What gets populated:</h4>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>8 Inventory Items (Ventilator, Surgical Mask, IV Drip, etc.)</li>
              <li>Model Registry v1.0.0 (GradientBoosting, MAE: 157.17, RMSE: 215.72)</li>
              <li>Prediction History with feature contributions</li>
              <li>Dashboard Predictions (Estimated Demand, Shortfall, Replenishment Needs)</li>
              <li>Low Stock Alerts for items below minimum threshold</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Management
          </CardTitle>
          <CardDescription>
            View and manage user roles and permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead>Change Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <span className="capitalize">{user.role?.replace("_", " ")}</span>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role || "nurse"}
                        onValueChange={(value) => handleRoleChange(user.id, value as "admin" | "inventory_manager" | "nurse")}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="inventory_manager">
                            Inventory Manager
                          </SelectItem>
                          <SelectItem value="nurse">Nurse</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
