import { z } from "https://esm.sh/zod@3.23.8";

// Request bodies were previously `await req.json()` cast directly to a
// TypeScript interface with zero runtime checks -- a malformed or
// malicious body (wrong types, missing fields, negative stock, etc.) would
// either crash the function with an unhandled error or silently produce
// nonsensical DB writes. These schemas are the actual runtime boundary
// check; the TS interfaces alone never enforced anything at request time.

export const itemLikeSchema = z.object({
  item_name: z.string().min(1).max(200),
  item_type: z.enum(["Equipment", "Consumable"]),
  current_stock: z.number().finite().min(0),
  min_required: z.number().finite().min(0),
  max_capacity: z.number().finite().min(0),
  avg_usage_per_day: z.number().finite().min(0),
  restock_lead_time: z.number().finite().min(0),
  unit_cost: z.number().finite().min(0),
  vendor_name: z.string().max(200).optional(),
});

export const uuidSchema = z.string().uuid();

export function parseOrError<T>(schema: z.ZodType<T>, body: unknown):
  { success: true; data: T } | { success: false; message: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { success: false, message: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { success: true, data: result.data };
}
