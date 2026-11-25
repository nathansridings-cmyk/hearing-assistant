import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertCsvOutsideRepo, codesToSql, parsePromoCsv } from "../scripts/import-codes.mjs";

describe("promo CSV import", () => {
  it("reads a one-column Promotion code file and skips blanks and duplicates", () => {
    const parsed = parsePromoCsv("\uFEFFPromotion code\r\nFAKE-0001\r\n\r\n\"FAKE-0002\"\r\nFAKE-0001\r\n");
    expect(parsed.codes).toEqual(["FAKE-0001", "FAKE-0002"]);
    expect(parsed.skippedDuplicates).toBe(1);
  });

  it("rejects a bad header, extra columns, and unsafe code text without echoing the value", () => {
    expect(() => parsePromoCsv("code\nFAKE-0001\n")).toThrow(/Promotion code/);
    expect(() => parsePromoCsv("Promotion code\nFAKE-0001,extra\n")).toThrow(/one column/);
    try {
      parsePromoCsv("Promotion code\nFAKE-0001'); DROP TABLE codes;--\n");
      throw new Error("expected invalid code to throw");
    } catch (err) {
      expect(err.message).toMatch(/line 2/i);
      expect(err.message).not.toMatch(/DROP/i);
    }
  });

  it("builds insert SQL only from already-validated fake codes", () => {
    const sql = codesToSql(["FAKE-0001", "FAKE-0002"]);
    expect(sql).toContain("INSERT INTO codes (code) VALUES");
    expect(sql).toContain("('FAKE-0001')");
    expect(sql).toContain("ON CONFLICT(code) DO NOTHING;");
  });

  it("refuses a CSV path inside the public repository", () => {
    expect(() => assertCsvOutsideRepo("/tmp/hearing-promo-codes.csv", "/tmp/not-the-repo")).not.toThrow();
    expect(() => assertCsvOutsideRepo(resolve("/repo/hearing-assistant/promo-codes.csv"), "/repo/hearing-assistant"))
      .toThrow(/inside the public repository/);
  });

  it("can parse a file that lives outside the repo", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "hearing-promo-csv-"));
    const file = resolve(dir, "promo-codes.csv");
    writeFileSync(file, "Promotion code\nFAKE-0001\nFAKE-0002\n");
    expect(() => assertCsvOutsideRepo(file)).not.toThrow();
    expect(parsePromoCsv("Promotion code\nFAKE-0001\n").codes).toEqual(["FAKE-0001"]);
  });
});
