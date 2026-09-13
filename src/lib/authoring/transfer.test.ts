import { describe, expect, it } from "vitest";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { sampleTrendItem } from "@/lib/ngn/fixtures/trend";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import type { Item } from "@/lib/ngn/schemas";
import { validateCaseStudy, validateItem } from "@/lib/ngn/validate";
import { fromItemRow, type ItemRow } from "@/lib/supabase/itemRows";
import {
  IMPORT_MAX_BYTES,
  caseStudyEnvelope,
  importRowsFor,
  importSummary,
  itemsEnvelope,
  parseImport,
} from "./transfer";

const item = (input: unknown): Item => {
  const result = validateItem(input);
  if (!result.ok) throw new Error("fixture must be valid");
  return result.value;
};
const sample = () => {
  const result = validateCaseStudy(sampleCaseStudy);
  if (!result.ok) throw new Error("sample case study must be valid");
  return result.value;
};

const NEW_ID = "7d9e2c1a-0b3f-4c5d-8e6f-1a2b3c4d5e6f";

/** What the import function stores: the row, with the new row's id in its content, at version 1. */
const storedAs = (row: ItemRow) =>
  fromItemRow({ ...row, content: { ...(row.content as object), id: NEW_ID }, version: 1 });

describe("export then import", () => {
  const entries: [string, unknown][] = [
    ...ITEM_TYPES.map((type): [string, unknown] => [type, FIXTURES[type].canonical]),
    ["trend item", sampleTrendItem],
  ];

  it.each(entries)("%s survives unchanged apart from its id and version", (_name, input) => {
    const original = item(input);
    const parsed = parseImport(JSON.stringify(itemsEnvelope([original])));
    if (!parsed.ok || parsed.kind !== "items") throw new Error("the export should import");
    expect(parsed.items).toEqual([original]);

    const [row] = importRowsFor(parsed).items;
    expect(row!.content).not.toHaveProperty("id");
    const back = storedAs(row!);
    expect(back.ok && back.value).toEqual({ ...original, id: NEW_ID, version: 1 });
  });

  it("a case study survives with its record and six steps, in order", () => {
    const original = sample();
    const parsed = parseImport(JSON.stringify(caseStudyEnvelope(original)));
    if (!parsed.ok || parsed.kind !== "caseStudy") throw new Error("the export should import");
    expect(parsed.caseStudy).toEqual(original);

    const rows = importRowsFor(parsed);
    expect(rows.items).toEqual([]);
    expect(rows.caseStudy).not.toHaveProperty("id");
    expect(rows.caseStudy?.title).toBe(original.title);
    expect(rows.caseStudy?.items.map((row) => row.cjmm_step)).toEqual([1, 2, 3, 4, 5, 6]);
    rows.caseStudy?.items.forEach((row, index) => {
      const back = storedAs(row);
      expect(back.ok && back.value).toEqual({ ...original.items[index], id: NEW_ID, version: 1 });
    });
  });
});

describe("refusing an import", () => {
  const good = () => item(FIXTURES.multiple_choice.canonical);

  it("refuses oversized input before reading it", () => {
    expect(parseImport(`{${" ".repeat(IMPORT_MAX_BYTES)}}`)).toEqual({
      ok: false,
      errors: ["This import is too large. Import at most 800 KB at a time."],
    });
  });

  it("refuses text that is not JSON", () => {
    expect(parseImport("{ not json")).toEqual({ ok: false, errors: ["This is not valid JSON."] });
  });

  it("refuses anything that is not a learn.v1 export", () => {
    const expected = {
      ok: false,
      errors: ['This is not a LeaRN export. It needs "format": "learn.v1".'],
    };
    expect(parseImport(JSON.stringify({ format: "learn.v0", items: [good()] }))).toEqual(expected);
    expect(parseImport(JSON.stringify([good()]))).toEqual(expected);
  });

  it("refuses an export holding both items and a case study, or neither", () => {
    const expected = {
      ok: false,
      errors: ["A LeaRN export holds either items or one case study."],
    };
    expect(parseImport(JSON.stringify({ format: "learn.v1" }))).toEqual(expected);
    expect(
      parseImport(JSON.stringify({ format: "learn.v1", items: [good()], caseStudy: sample() })),
    ).toEqual(expected);
  });

  it("refuses an empty item list, or more items than one import takes", () => {
    const expected = { ok: false, errors: ["Include between 1 and 50 items."] };
    expect(parseImport(JSON.stringify({ format: "learn.v1", items: [] }))).toEqual(expected);
    const many = Array.from({ length: 51 }, () => good());
    expect(parseImport(JSON.stringify({ format: "learn.v1", items: many }))).toEqual(expected);
  });

  it("names each invalid entry and field, and refuses the whole import", () => {
    const bad = { ...good(), stem: { kind: "markdown", value: "" } };
    const result = parseImport(JSON.stringify({ format: "learn.v1", items: [good(), bad] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('Item 2: "stem.value" is not valid.');
    expect(result.errors.some((error) => error.startsWith("Item 1"))).toBe(false);
  });

  it("names a case study step by its number", () => {
    const original = sample();
    const items = original.items.map((entry, index) =>
      index === 2 ? { ...entry, stem: { kind: "markdown", value: "" } } : entry,
    );
    const result = parseImport(
      JSON.stringify({ format: "learn.v1", caseStudy: { ...original, items } }),
    );
    expect(!result.ok && result.errors).toContain('Case study, step 3: "stem.value" is not valid.');
  });

  it("never repeats the file's own text back in a message", () => {
    const hostile = {
      ...good(),
      type: "<img src=x onerror=alert(1)>",
      "<script>alert(1)</script>": true,
    };
    const result = parseImport(JSON.stringify({ format: "learn.v1", items: [hostile] }));
    expect(result.ok).toBe(false);
    const text = !result.ok ? result.errors.join(" ") : "";
    expect(text).not.toContain("<img");
    expect(text).not.toContain("<script>");
  });
});

describe("importSummary", () => {
  it("says what was imported, always as drafts", () => {
    const a = item(FIXTURES.multiple_choice.canonical);
    expect(importSummary({ ok: true, kind: "items", items: [a] })).toBe(
      "Imported 1 item as a draft.",
    );
    expect(importSummary({ ok: true, kind: "items", items: [a, a] })).toBe(
      "Imported 2 items as drafts.",
    );
    const caseStudy = sample();
    expect(importSummary({ ok: true, kind: "caseStudy", caseStudy })).toBe(
      `Imported the case study "${caseStudy.title}" and its six steps as drafts.`,
    );
  });
});
