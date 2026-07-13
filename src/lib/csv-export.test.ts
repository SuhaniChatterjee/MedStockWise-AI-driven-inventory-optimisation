import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportToCsv } from "./csv-export";

// jsdom doesn't implement URL.createObjectURL/revokeObjectURL at all, so
// they must be stubbed with plain assignment (vi.spyOn requires the method
// to already exist on the object).
describe("exportToCsv", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // jsdom's Blob polyfill doesn't implement .text()/.arrayBuffer(), so
  // capture the content at construction time instead of reading it back
  // off the Blob instance.
  function captureBlobText(): Promise<string> {
    return new Promise((resolve) => {
      const OriginalBlob = globalThis.Blob;
      vi.spyOn(globalThis, "Blob").mockImplementation((parts?: BlobPart[], options?: BlobPropertyBag) => {
        resolve(String(parts?.[0] ?? ""));
        return new OriginalBlob(parts, options);
      });
    });
  }

  it("does nothing for an empty row list", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    exportToCsv("empty", []);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("writes a header row followed by each data row", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const textPromise = captureBlobText();

    exportToCsv("items", [
      { name: "Gloves", stock: 100 },
      { name: "Masks", stock: 50 },
    ]);

    const text = await textPromise;
    expect(text).toBe("name,stock\nGloves,100\nMasks,50");
  });

  it("escapes commas, quotes, and newlines per RFC 4180", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const textPromise = captureBlobText();

    exportToCsv("items", [{ name: 'Item, "special"\ncase', stock: 1 }]);

    const text = await textPromise;
    expect(text).toBe('name,stock\n"Item, ""special""\ncase",1');
  });

  it("appends .csv to the filename if missing", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, "appendChild");

    exportToCsv("report", [{ a: 1 }]);

    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.download).toBe("report.csv");
  });
});
