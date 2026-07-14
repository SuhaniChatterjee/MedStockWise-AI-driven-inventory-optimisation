import { parseCsv } from "./csv-parse";

export interface ImportRow {
  item_name: string;
  item_type: string;
  current_stock: number;
  min_required: number;
  max_capacity: number;
  unit_cost: number;
  avg_usage_per_day: number;
  restock_lead_time: number;
  vendor_name: string | null;
  demand_category: string;
  expiry_date: string | null;
}

export interface RowError {
  line: number; // 1-based data row (excludes header)
  message: string;
}

export interface ImportResult {
  rows: ImportRow[];
  errors: RowError[];
  totalDataRows: number;
}

const REQUIRED = [
  "item_name",
  "item_type",
  "current_stock",
  "min_required",
  "max_capacity",
  "unit_cost",
  "avg_usage_per_day",
  "restock_lead_time",
] as const;

const VALID_DEMAND_CATEGORIES = new Set([
  "general",
  "allergy",
  "respiratory_airway",
  "analgesic",
  "anti_inflammatory",
  "sedative",
]);

const NUMERIC_FIELDS = [
  "current_stock",
  "min_required",
  "max_capacity",
  "unit_cost",
  "avg_usage_per_day",
  "restock_lead_time",
] as const;

/** Normalize a header/key: lowercase, spaces/hyphens -> underscore. */
function norm(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export const TEMPLATE_HEADERS =
  "item_name,item_type,current_stock,min_required,max_capacity,unit_cost,avg_usage_per_day,restock_lead_time,vendor_name,demand_category,expiry_date";

export function inventoryCsvTemplate(): string {
  return (
    TEMPLATE_HEADERS +
    "\n" +
    "Surgical Mask,Consumable,2000,400,5000,0.5,300,7,Acme Medical,respiratory_airway,2027-06-30\n" +
    "Ventilator,Equipment,20,5,40,25000,1,30,MedEquip Co,general,\n"
  );
}

/**
 * Parses + validates an inventory CSV. Returns the valid rows ready to insert
 * plus per-line errors. hospital_id is intentionally NOT set here -- the DB
 * defaults it to the caller's own hospital (current_hospital_id()), so imports
 * can't be aimed at another hospital even by crafting the CSV.
 */
export function parseInventoryCsv(text: string): ImportResult {
  const raw = parseCsv(text);
  const errors: RowError[] = [];
  const rows: ImportRow[] = [];

  if (raw.length === 0) {
    return { rows, errors: [{ line: 0, message: "No data rows found." }], totalDataRows: 0 };
  }

  // Normalize the header keys once (parseCsv keys by the raw header text).
  const keyMap = new Map<string, string>(); // normalized -> original key
  Object.keys(raw[0]).forEach((k) => keyMap.set(norm(k), k));

  const missing = REQUIRED.filter((r) => !keyMap.has(r));
  if (missing.length > 0) {
    return {
      rows,
      errors: [{ line: 0, message: `Missing required column(s): ${missing.join(", ")}` }],
      totalDataRows: raw.length,
    };
  }

  const get = (record: Record<string, string>, field: string) => record[keyMap.get(field)!] ?? "";

  raw.forEach((record, i) => {
    const line = i + 1;
    const rowErrors: string[] = [];

    const item_name = get(record, "item_name");
    if (!item_name) rowErrors.push("item_name is empty");

    const item_type = get(record, "item_type");
    if (item_type !== "Equipment" && item_type !== "Consumable") {
      rowErrors.push(`item_type must be Equipment or Consumable (got "${item_type}")`);
    }

    const nums: Record<string, number> = {};
    for (const f of NUMERIC_FIELDS) {
      const v = Number(get(record, f));
      if (get(record, f) === "" || Number.isNaN(v)) {
        rowErrors.push(`${f} must be a number`);
      } else if (v < 0) {
        rowErrors.push(`${f} must be >= 0`);
      } else {
        nums[f] = v;
      }
    }

    let demand_category = norm(keyMap.has("demand_category") ? get(record, "demand_category") : "");
    if (!demand_category) demand_category = "general";
    if (!VALID_DEMAND_CATEGORIES.has(demand_category)) {
      rowErrors.push(`demand_category "${demand_category}" is not valid`);
    }

    if (rowErrors.length > 0) {
      errors.push({ line, message: rowErrors.join("; ") });
      return;
    }

    // Optional expiry_date: accept blank or a valid YYYY-MM-DD; reject garbage.
    let expiry_date: string | null = null;
    const rawExpiry = keyMap.has("expiry_date") ? get(record, "expiry_date") : "";
    if (rawExpiry) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawExpiry) || Number.isNaN(Date.parse(rawExpiry))) {
        errors.push({ line, message: `expiry_date "${rawExpiry}" must be YYYY-MM-DD` });
        return;
      }
      expiry_date = rawExpiry;
    }

    const vendor = keyMap.has("vendor_name") ? get(record, "vendor_name") : "";
    rows.push({
      item_name,
      item_type,
      current_stock: nums.current_stock,
      min_required: nums.min_required,
      max_capacity: nums.max_capacity,
      unit_cost: nums.unit_cost,
      avg_usage_per_day: nums.avg_usage_per_day,
      restock_lead_time: nums.restock_lead_time,
      vendor_name: vendor || null,
      demand_category,
      expiry_date,
    });
  });

  return { rows, errors, totalDataRows: raw.length };
}
