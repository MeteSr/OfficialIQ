// CSV export helpers.
//
// Cells can hold text other users wrote (display names, titles). A cell that
// starts with = + - @ (or a tab/CR) is run as a formula by Excel and Sheets,
// so such cells get a leading apostrophe (OWASP "CSV injection").
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: string | number): string {
  if (typeof v === "number") return String(v);
  const s = FORMULA_START.test(v) ? `'${v}` : v;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map(r => r.map(csvCell).join(",")).join("\n");
}
