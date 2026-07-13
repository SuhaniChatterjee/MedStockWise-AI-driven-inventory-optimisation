import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InventoryItem {
  id: string;
  item_name: string;
  item_type: string;
  current_stock: number;
  min_required: number;
  max_capacity: number;
  unit_cost: number;
  avg_usage_per_day: number;
  restock_lead_time: number;
  vendor_name: string | null;
}

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  item_name: "",
  item_type: "Equipment",
  current_stock: 0,
  min_required: 0,
  max_capacity: 0,
  unit_cost: 0,
  avg_usage_per_day: 0,
  restock_lead_time: 0,
  vendor_name: "",
};

export default function Inventory() {
  const { isManager } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebouncedValue(searchTerm, 300);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Server-side pagination + search (via .range()/.ilike()) rather than
  // fetching every row and filtering client-side, so this doesn't degrade
  // as the inventory grows.
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["inventory-items", page, debouncedSearch],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("inventory_items")
        .select("*", { count: "exact" })
        .order("item_name")
        .range(from, to);

      if (debouncedSearch.trim()) {
        query = query.ilike("item_name", `%${debouncedSearch.trim()}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { items: (data ?? []) as InventoryItem[], total: count ?? 0 };
    },
    placeholderData: (previous) => previous,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { error } = await supabase.from("inventory_items").insert([formData]);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Item added successfully",
      });
      setIsDialogOpen(false);
      setFormData(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    }
    setSubmitting(false);
  };

  const getStockStatus = (item: InventoryItem) => {
    if (item.current_stock < item.min_required * 0.5) {
      return <Badge variant="destructive">Critical</Badge>;
    }
    if (item.current_stock < item.min_required) {
      return <Badge className="bg-warning text-white">Low Stock</Badge>;
    }
    return <Badge className="bg-success text-white">Normal</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="space-y-2">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-6 w-96" />
        </div>
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-none shadow-lg">
        <CardContent className="py-12 text-center text-muted-foreground">
          <p>Could not load inventory: {error instanceof Error ? error.message : "Unknown error"}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Inventory Management
          </h1>
          <p className="text-muted-foreground text-lg">
            Track and manage all hospital inventory items
          </p>
        </div>
        {isManager && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2 shadow-lg">
                <Plus className="h-5 w-5" />
                Add New Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Inventory Item</DialogTitle>
                <DialogDescription>
                  Enter the details for the new inventory item
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="item_name">Item Name</Label>
                    <Input
                      id="item_name"
                      value={formData.item_name}
                      onChange={(e) =>
                        setFormData({ ...formData, item_name: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="item_type">Item Type</Label>
                    <Select
                      value={formData.item_type}
                      onValueChange={(value) =>
                        setFormData({ ...formData, item_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Equipment">Equipment</SelectItem>
                        <SelectItem value="Consumable">Consumable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="current_stock">Current Stock</Label>
                    <Input
                      id="current_stock"
                      type="number"
                      value={formData.current_stock}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          current_stock: parseInt(e.target.value) || 0,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="min_required">Min Required</Label>
                    <Input
                      id="min_required"
                      type="number"
                      value={formData.min_required}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          min_required: parseInt(e.target.value) || 0,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_capacity">Max Capacity</Label>
                    <Input
                      id="max_capacity"
                      type="number"
                      value={formData.max_capacity}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_capacity: parseInt(e.target.value) || 0,
                        })
                      }
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
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          unit_cost: parseFloat(e.target.value) || 0,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="avg_usage_per_day">Avg Usage/Day</Label>
                    <Input
                      id="avg_usage_per_day"
                      type="number"
                      value={formData.avg_usage_per_day}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          avg_usage_per_day: parseInt(e.target.value) || 0,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="restock_lead_time">Restock Lead Time (days)</Label>
                    <Input
                      id="restock_lead_time"
                      type="number"
                      value={formData.restock_lead_time}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          restock_lead_time: parseInt(e.target.value) || 0,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="vendor_name">Vendor Name</Label>
                    <Input
                      id="vendor_name"
                      value={formData.vendor_name}
                      onChange={(e) =>
                        setFormData({ ...formData, vendor_name: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Adding..." : "Add Item"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search Card */}
      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Search Inventory</CardTitle>
          <CardDescription>
            Find items by name
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search for inventory items..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(0);
              }}
              className="pl-10 h-12"
            />
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card className="border-none shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Inventory Items</CardTitle>
            <Badge variant="secondary" className="text-base px-3 py-1">
              {total} item{total === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`rounded-lg border overflow-hidden transition-opacity ${isFetching ? "opacity-60" : ""}`}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Item Name</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Current Stock</TableHead>
                  <TableHead className="font-semibold">Min Required</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Unit Cost</TableHead>
                  <TableHead className="font-semibold">Avg Usage/Day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No items match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{item.item_name}</TableCell>
                      <TableCell>{item.item_type}</TableCell>
                      <TableCell className="font-semibold">{item.current_stock}</TableCell>
                      <TableCell>{item.min_required}</TableCell>
                      <TableCell>{getStockStatus(item)}</TableCell>
                      <TableCell>${parseFloat(item.unit_cost.toString()).toFixed(2)}</TableCell>
                      <TableCell>{item.avg_usage_per_day}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
