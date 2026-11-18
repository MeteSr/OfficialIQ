import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes text and escapes quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it("neutralises formula-looking cells", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+1")).toBe('"\'+1"');
    expect(csvCell("@SUM(A1)")).toBe('"\'@SUM(A1)"');
  });
  it("leaves numbers alone", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(toCsv([["a", 1], ["b", 2]])).toBe('"a",1\n"b",2');
  });
});
