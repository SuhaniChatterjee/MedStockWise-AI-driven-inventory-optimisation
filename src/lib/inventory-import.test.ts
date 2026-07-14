import { describe, expect, it } from "vitest";
import { inventoryCsvTemplate, parseInventoryCsv } from "./inventory-import";

const HEADER =
  "item_name,item_type,current_stock,min_required,max_capacity,unit_cost,avg_usage_per_day,restock_lead_time,vendor_name,demand_category";

describe("parseInventoryCsv", () => {
  it("parses a valid row", () => {
    const { rows, errors } = parseInventoryCsv(
      `${HEADER}\nGloves,Consumable,100,50,500,0.5,10,7,Acme,general`
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      item_name: "Gloves",
      item_type: "Consumable",
      current_stock: 100,
      vendor_name: "Acme",
      demand_category: "general",
    });
  });

  it("reports missing required columns", () => {
    const { errors, rows } = parseInventoryCsv("item_name,item_type\nGloves,Consumable");
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/Missing required column/);
  });

  it("flags a bad item_type and non-numeric fields per line", () => {
    const { rows, errors } = parseInventoryCsv(
      `${HEADER}\nGloves,Gadget,abc,50,500,0.5,10,7,,general`
    );
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
    expect(errors[0].message).toMatch(/item_type must be/);
    expect(errors[0].message).toMatch(/current_stock must be a number/);
  });

  it("rejects negative numbers", () => {
    const { errors } = parseInventoryCsv(
      `${HEADER}\nGloves,Consumable,-5,50,500,0.5,10,7,,general`
    );
    expect(errors[0].message).toMatch(/current_stock must be >= 0/);
  });

  it("defaults demand_category to general when blank, rejects invalid", () => {
    const ok = parseInventoryCsv(`${HEADER}\nGloves,Consumable,100,50,500,0.5,10,7,,`);
    expect(ok.rows[0].demand_category).toBe("general");

    const bad = parseInventoryCsv(`${HEADER}\nGloves,Consumable,100,50,500,0.5,10,7,,plague`);
    expect(bad.errors[0].message).toMatch(/demand_category/);
  });

  it("accepts case-insensitive / spaced headers", () => {
    const header = "Item Name,Item Type,Current Stock,Min Required,Max Capacity,Unit Cost,Avg Usage Per Day,Restock Lead Time";
    const { rows, errors } = parseInventoryCsv(`${header}\nGloves,Consumable,100,50,500,0.5,10,7`);
    expect(errors).toEqual([]);
    expect(rows[0].item_name).toBe("Gloves");
    expect(rows[0].demand_category).toBe("general"); // optional column absent -> default
  });

  it("keeps valid rows and collects errors when a batch is mixed", () => {
    const { rows, errors } = parseInventoryCsv(
      `${HEADER}\nGood,Consumable,100,50,500,0.5,10,7,,general\nBad,Consumable,x,50,500,0.5,10,7,,general`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].item_name).toBe("Good");
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
  });

  it("its own template parses cleanly", () => {
    const { rows, errors } = parseInventoryCsv(inventoryCsvTemplate());
    expect(errors).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
  });
});
