import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv-parse";

describe("parseCsv", () => {
  it("parses a simple header + rows into objects", () => {
    const out = parseCsv("name,qty\nGloves,100\nMasks,50");
    expect(out).toEqual([
      { name: "Gloves", qty: "100" },
      { name: "Masks", qty: "50" },
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const out = parseCsv('name,note\n"Gloves, large",ok');
    expect(out).toEqual([{ name: "Gloves, large", note: "ok" }]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const out = parseCsv('name,note\n"6"" tubing","a ""quoted"" word"');
    expect(out).toEqual([{ name: '6" tubing', note: 'a "quoted" word' }]);
  });

  it("handles newlines inside quoted fields", () => {
    const out = parseCsv('name,note\n"multi\nline",ok');
    expect(out).toEqual([{ name: "multi\nline", note: "ok" }]);
  });

  it("normalizes CRLF line endings", () => {
    const out = parseCsv("a,b\r\n1,2\r\n");
    expect(out).toEqual([{ a: "1", b: "2" }]);
  });

  it("trims headers and values and skips blank trailing lines", () => {
    const out = parseCsv(" name , qty \n Gloves , 100 \n\n");
    expect(out).toEqual([{ name: "Gloves", qty: "100" }]);
  });

  it("returns empty for empty or header-only input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("name,qty")).toEqual([]); // header only, no data rows
  });
});
