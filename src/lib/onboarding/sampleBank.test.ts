import { describe, expect, it } from "vitest";
import { SAMPLE_TAG } from "@/lib/ngn/fixtures";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import { SAMPLE_BANK_NAME, sampleImport, sampleSet } from "./sampleBank";

describe("sampleSet", () => {
  it("is the seed's set: every canonical item, the Trend item and the case study", () => {
    const { items, caseStudy } = sampleSet();
    expect(items).toHaveLength(ITEM_TYPES.length + 1);
    expect(items.map((item) => (item as { type: string }).type)).toEqual([
      ...ITEM_TYPES,
      "matrix_multiple_choice",
    ]);
    expect((caseStudy as { items: unknown[] }).items).toHaveLength(6);
  });
});

describe("sampleImport", () => {
  const imported = sampleImport();

  it("passes the import validation and makes one write's worth of rows", () => {
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.rows.items).toHaveLength(ITEM_TYPES.length + 1);
    expect(imported.rows.caseStudy?.items).toHaveLength(6);
  });

  it("is labeled Sample, as the seed is", () => {
    if (!imported.ok) throw new Error("sample import is invalid");
    for (const row of imported.rows.items) expect(row.tags).toContain(SAMPLE_TAG);
    expect(imported.rows.caseStudy?.tags).toContain(SAMPLE_TAG);
  });

  it("carries no ids from the fixtures, so the database gives every row a new one", () => {
    if (!imported.ok) throw new Error("sample import is invalid");
    const rows = [...imported.rows.items, ...(imported.rows.caseStudy?.items ?? [])];
    for (const row of rows) {
      expect(row.version).toBe(1);
      expect(row.content).not.toHaveProperty("id");
    }
  });

  it("returns fresh rows each call, so no caller can change another's", () => {
    const again = sampleImport();
    if (!imported.ok || !again.ok) throw new Error("sample import is invalid");
    expect(again.rows).toEqual(imported.rows);
    expect(again.rows.items).not.toBe(imported.rows.items);
  });

  it("names the bank Sample bank", () => {
    expect(SAMPLE_BANK_NAME).toBe("Sample bank");
  });
});
