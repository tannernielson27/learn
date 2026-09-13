import { describe, expect, it } from "vitest";
import { allFixtures, sampleCaseStudy, sampleTrendItem } from "@/lib/ngn/fixtures";
import { validateCaseStudy, validateItem } from "@/lib/ngn/validate";
import type { Item } from "@/lib/ngn/schemas";
import { fromItemRow, toCaseStudyRow, toItemRow } from "./itemRows";

function parsed(input: unknown): Item {
  const result = validateItem(input);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value;
}

const samples: [string, unknown][] = [
  ...allFixtures.flatMap((f): [string, unknown][] => [
    [`${f.type} canonical`, f.canonical],
    [`${f.type} edge`, f.edge],
  ]),
  ["trend item", sampleTrendItem],
];

describe("toItemRow", () => {
  it.each(samples)("keeps the key and rationale out of content: %s", (_name, input) => {
    const item = parsed(input);
    const row = toItemRow(item);
    expect(row.content).not.toHaveProperty("answerKey");
    expect(row.content).not.toHaveProperty("rationale");
    expect(row.content).not.toHaveProperty("scoring");
    expect(row.answer_key).toEqual(item.answerKey);
    expect(row.rationale).toEqual(item.rationale);
    expect(row.scoring).toEqual(item.scoring);
    expect(row.type).toBe(item.type);
  });

  it.each(samples)("round-trips through a row unchanged: %s", (_name, input) => {
    const item = parsed(input);
    const back = fromItemRow(toItemRow(item));
    expect(back).toEqual({ ok: true, value: item, warnings: expect.any(Array) });
  });

  it("stores a missing CJMM step as null, and tags and version as columns", () => {
    const item = parsed(allFixtures[0].canonical);
    const row = toItemRow({ ...item, cjmmStep: undefined, tags: ["cardiac"], version: 1 });
    expect(row.cjmm_step).toBeNull();
    expect(row.tags).toEqual(["cardiac"]);
    expect(row.version).toBe(1);
    expect(row.content).not.toHaveProperty("tags");
  });
});

describe("fromItemRow", () => {
  it("rejects a row whose answer key does not fit its content", () => {
    const row = toItemRow(parsed(allFixtures[0].canonical));
    const result = fromItemRow({ ...row, answer_key: { correctOptionId: "no-such-option" } });
    expect(result.ok).toBe(false);
  });

  it("rejects a row whose type column disagrees with its content", () => {
    const row = toItemRow(parsed(allFixtures[0].canonical));
    const result = fromItemRow({ ...row, type: "bowtie" });
    expect(result.ok).toBe(false);
  });
});

describe("toCaseStudyRow", () => {
  it("splits a case study into its record and six item rows in step order", () => {
    const result = validateCaseStudy(sampleCaseStudy);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const row = toCaseStudyRow(result.value);
    expect(row.title).toBe(result.value.title);
    expect(row.ehr).toEqual(result.value.ehr);
    expect(row.items).toHaveLength(6);
    expect(row.items.map((i) => i.cjmm_step)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const item of row.items) expect(item.content).not.toHaveProperty("answerKey");
  });
});
