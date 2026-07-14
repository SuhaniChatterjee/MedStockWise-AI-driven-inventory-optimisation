import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, Download, FileCheck2, AlertTriangle } from "lucide-react";
import {
  inventoryCsvTemplate,
  parseInventoryCsv,
  type ImportResult,
} from "@/lib/inventory-import";

export function ImportInventoryDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setFileName(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    setResult(parseInventoryCsv(text));
  };

  const downloadTemplate = () => {
    const blob = new Blob([inventoryCsvTemplate()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!result || result.rows.length === 0) return;
    setImporting(true);
    // hospital_id is intentionally omitted -- the DB defaults it to the
    // caller's own hospital (current_hospital_id()), and RLS enforces that.
    const { error, count } = await supabase
      .from("inventory_items")
      .insert(result.rows, { count: "exact" });

    if (error) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Import complete",
        description: `Added ${count ?? result.rows.length} item${(count ?? result.rows.length) === 1 ? "" : "s"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      setOpen(false);
      reset();
    }
    setImporting(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg" variant="outline" className="gap-2">
          <Upload className="h-5 w-5" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Inventory from CSV</DialogTitle>
          <DialogDescription>
            Bulk-add items to your hospital's inventory. Items are added to your hospital only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Choose a CSV file</p>
              <p className="text-xs text-muted-foreground">
                Needs item_name, item_type, and the stock/cost/usage columns.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              Browse
            </Button>
          </div>

          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Download className="h-4 w-4" />
            Download template
          </button>

          {fileName && result && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">{fileName}</p>
              <div className="flex items-center gap-2 text-sm text-success">
                <FileCheck2 className="h-4 w-4" />
                {result.rows.length} valid row{result.rows.length === 1 ? "" : "s"} ready to import
              </div>
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped
                  </div>
                  <ul className="max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-0.5">
                    {result.errors.slice(0, 8).map((e) => (
                      <li key={e.line}>
                        {e.line > 0 ? `Line ${e.line}: ` : ""}
                        {e.message}
                      </li>
                    ))}
                    {result.errors.length > 8 && <li>…and {result.errors.length - 8} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || !result || result.rows.length === 0}
            >
              {importing
                ? "Importing…"
                : `Import ${result?.rows.length ?? 0} item${result?.rows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
