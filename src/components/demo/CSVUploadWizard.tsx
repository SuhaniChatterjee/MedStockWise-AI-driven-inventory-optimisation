import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileCheck, AlertTriangle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDropzone } from "react-dropzone";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

const REQUIRED_COLUMNS = [
  "item_name",
  "item_type", 
  "current_stock",
  "min_required",
  "max_capacity",
  "avg_usage_per_day",
  "restock_lead_time",
  "unit_cost"
];

interface CSVUploadWizardProps {
  onPredictionsComplete?: (results: any[]) => void;
}

export function CSVUploadWizard({ onPredictionsComplete }: CSVUploadWizardProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validation, setValidation] = useState<any>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const csvFile = acceptedFiles[0];
    if (csvFile) {
      setFile(csvFile);
      parseAndValidateCSV(csvFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const parseAndValidateCSV = async (file: File) => {
    const text = await file.text();
    const rows = text.split('\n').map(row => row.split(','));
    const headers = rows[0].map(h => h.trim().toLowerCase());
    
    // Auto-detect column mapping
    const mapping: Record<string, string> = {};
    REQUIRED_COLUMNS.forEach(reqCol => {
      const match = headers.find(h => 
        h.includes(reqCol.replace(/_/g, '')) || 
        h.replace(/[_\s]/g, '').includes(reqCol.replace(/_/g, ''))
      );
      if (match) mapping[reqCol] = match;
    });

    setColumnMapping(mapping);

    // Validate data
    const missingColumns = REQUIRED_COLUMNS.filter(col => !mapping[col]);
    const rowCount = rows.length - 1;
    
    setValidation({
      totalRows: rowCount,
      missingColumns,
      headers,
      preview: rows.slice(1, 11), // First 10 data rows
      hasIssues: missingColumns.length > 0
    });

    toast({
      title: "CSV Parsed",
      description: `Found ${rowCount} rows with ${headers.length} columns`,
    });
  };

  const handleProcessFile = async () => {
    if (!file || validation?.hasIssues) {
      toast({
        title: "Cannot Process",
        description: "Please fix validation issues first",
        variant: "destructive",
      });
      return;
    }

    setUploadProgress(10);

    try {
      const text = await file.text();
      const rows = text.split('\n').filter(row => row.trim()).slice(1); // Skip header
      
      const predictions = [];
      const total = rows.length;
      
      for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].split(',').map(c => c.trim());
        const headers = validation.headers;
        
        // Map row data to required fields
        const rowData: any = {};
        headers.forEach((header: string, idx: number) => {
          const normalizedHeader = header.toLowerCase().replace(/[_\s]/g, '');
          REQUIRED_COLUMNS.forEach(reqCol => {
            const normalizedReqCol = reqCol.replace(/_/g, '');
            if (normalizedHeader.includes(normalizedReqCol)) {
              rowData[reqCol] = cells[idx];
            }
          });
        });

        // Call prediction endpoint
        const { data, error } = await supabase.functions.invoke('run-predictions', {
          body: {
            run_all: false,
            single_prediction: {
              item_name: rowData.item_name,
              item_type: rowData.item_type,
              current_stock: parseInt(rowData.current_stock),
              min_required: parseInt(rowData.min_required),
              max_capacity: parseInt(rowData.max_capacity),
              avg_usage_per_day: parseInt(rowData.avg_usage_per_day),
              restock_lead_time: parseInt(rowData.restock_lead_time),
              unit_cost: parseFloat(rowData.unit_cost),
              vendor_name: rowData.vendor_name || ''
            }
          }
        });

        if (!error && data) {
          predictions.push({
            item_id: `csv-${i}`,
            predicted_demand: data.estimated_demand,
            confidence_score: 0.85,
            feature_values: rowData,
            feature_contributions: data.feature_contributions,
            inventory_items: {
              item_name: rowData.item_name,
              item_type: rowData.item_type
            }
          });
        }

        setUploadProgress(10 + Math.floor((i + 1) / total * 80));
      }

      onPredictionsComplete?.(predictions);
      
      toast({
        title: "Processing Complete",
        description: `Successfully processed ${predictions.length} predictions`,
      });
      setUploadProgress(100);
      
      // Reset after 2 seconds
      setTimeout(() => {
        setUploadProgress(0);
        setFile(null);
        setValidation(null);
      }, 2000);
    } catch (error: any) {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadProgress(0);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Your Hospital Data</CardTitle>
          <CardDescription>
            Drag and drop your inventory CSV file or click to browse. Max file size: 10MB
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
              transition-colors hover:border-primary/50
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-border'}
            `}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-lg">Drop the CSV file here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">Drag & drop your CSV file here</p>
                <p className="text-sm text-muted-foreground">or click to select file</p>
              </div>
            )}
          </div>

          {file && (
            <div className="mt-4 p-4 bg-muted rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                Remove
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {validation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {validation.hasIssues ? (
                <AlertTriangle className="h-5 w-5 text-warning" />
              ) : (
                <FileCheck className="h-5 w-5 text-success" />
              )}
              Validation Results
            </CardTitle>
            <CardDescription>
              {validation.totalRows} rows detected
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {validation.hasIssues && (
              <Alert variant="destructive">
                <AlertDescription>
                  <p className="font-semibold mb-2">Missing Required Columns:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {validation.missingColumns.map((col: string) => (
                      <li key={col}>{col}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div>
              <h4 className="font-semibold mb-3">Column Mapping</h4>
              <div className="grid grid-cols-2 gap-3">
                {REQUIRED_COLUMNS.map(col => (
                  <div key={col} className="flex items-center gap-2">
                    <Badge variant={columnMapping[col] ? "default" : "destructive"}>
                      {col}
                    </Badge>
                    {columnMapping[col] && (
                      <span className="text-sm text-muted-foreground">
                        → {columnMapping[col]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-3">Preview (First 10 rows)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {validation.headers.map((h: string, i: number) => (
                        <th key={i} className="px-2 py-1 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validation.preview.map((row: string[], i: number) => (
                      <tr key={i} className="border-b">
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-1">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            <div className="flex gap-3">
              <Button 
                onClick={handleProcessFile}
                disabled={validation.hasIssues || uploadProgress > 0}
                className="flex-1"
              >
                Process File
              </Button>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
