import { describe, expect, it } from "vitest";
import { SAMPLE_TAG } from "@/lib/ngn/fixtures";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import { SAMPLE_BANK_NAME, sampleImport, samplePublishProblems, sampleSet } from "./sampleBank";

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

// #283: the sample arrives published, so every row in it must be one the editor would publish.
describe("samplePublishProblems", () => {
  it("finds none in the sample: every item and step validates and has a general rationale", () => {
    expect(samplePublishProblems(sampleSet())).toEqual([]);
  });

  it("names an item the editor would refuse to publish", () => {
    const { items, caseStudy } = sampleSet();
    const [first, ...rest] = items as { rationale: object }[];
    // Valid without a general rationale, which only the publish rule refuses.
    const noRationale = { ...first, rationale: { ...first.rationale, general: undefined } };
    expect(samplePublishProblems({ items: [noRationale, ...rest], caseStudy })).toEqual([
      "items.0 cannot be published",
    ]);
  });

  it("names an invalid item and an invalid case study", () => {
    const { items } = sampleSet();
    expect(
      samplePublishProblems({ items: [{ type: "nope" }, ...items.slice(1)], caseStudy: {} }),
    ).toEqual(["items.0 cannot be published", "the case study cannot be published"]);
  });

  it("names a case study step the editor would refuse to publish", () => {
    const { items, caseStudy } = sampleSet();
    const study = caseStudy as { items: { rationale: object }[] };
    const steps = study.items.map((step, index) =>
      index === 2
        ? { ...step, rationale: { ...step.rationale, general: { kind: "markdown", value: " " } } }
        : step,
    );
    expect(samplePublishProblems({ items, caseStudy: { ...study, items: steps } })).toEqual([
      "caseStudy.items.2 cannot be published",
    ]);
  });
});
