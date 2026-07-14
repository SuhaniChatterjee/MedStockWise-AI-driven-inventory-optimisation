/**
 * Minimal RFC-4180 CSV parser -- handles quoted fields, escaped quotes ("")
 * and commas/newlines inside quotes. Returns an array of row objects keyed by
 * the (trimmed) header row. No dependency; the existing demo wizard split on
 * commas naively, which corrupts any quoted field containing a comma.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    // Skip fully-empty trailing lines.
    .filter((cells) => cells.some((c) => c.trim() !== ""))
    .map((cells) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (cells[i] ?? "").trim();
      });
      return obj;
    });
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  // Normalize CRLF/CR to LF first.
  const s = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else {
      field += ch;
    }
  }

  // Flush the last field/row if the file didn't end with a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
