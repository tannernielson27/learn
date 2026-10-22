import { describe, expect, it } from "vitest";
import { distributionFor } from "@/lib/live/results";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { chartRows, stageQuestion, stageRationale } from "./stageItem";

const mc = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const sata = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const matrix = itemSchema.parse(FIXTURES.matrix_multiple_choice.canonical) as Item;

describe("stageQuestion", () => {
  it("is nothing before the item has arrived", () => {
    expect(stageQuestion(null)).toBeNull();
  });

  it("letters a multiple choice item's options A, B, C, D in the item's own order", () => {
    const question = stageQuestion(mc);
    expect(question?.stem).toEqual(mc.stem);
    expect(question?.options?.map((option) => option.letter)).toEqual(["A", "B", "C", "D"]);
    expect(question?.options?.[0]?.label).toBe("Auscultate the lungs and assess oxygen saturation");
  });

  it("letters a select-all item the same way", () => {
    expect(stageQuestion(sata)?.options?.[0]?.letter).toBe("A");
  });

  it("draws no options for a layout the stage cannot letter, only the question text", () => {
    const question = stageQuestion(matrix);
    expect(question?.stem).toEqual(matrix.stem);
    expect(question?.options).toBeNull();
  });

  it("carries nothing from the answer key or the rationale", () => {
    const text = JSON.stringify(stageQuestion(mc));
    expect(text).not.toContain("correctOptionId");
    expect(text).not.toContain(mc.rationale.general?.value ?? "no rationale");
  });
});

describe("stageRationale", () => {
  it("is the general rationale only once the answer is showing", () => {
    expect(stageRationale(mc, false)).toBeNull();
    expect(stageRationale(mc, true)).toEqual(mc.rationale.general);
    expect(stageRationale(null, true)).toBeNull();
  });
});

describe("chartRows", () => {
  const distribution = distributionFor(mc, [
    { type: "multiple_choice", optionId: "opt_a" },
    { type: "multiple_choice", optionId: "opt_a" },
    { type: "multiple_choice", optionId: "opt_c" },
  ]);

  it("lists every option with its letter and count, and marks no key before the reveal", () => {
    const rows = chartRows(distribution, false);
    expect(rows?.map((row) => [row.letter, row.count])).toEqual([
      ["A", 2],
      ["B", 0],
      ["C", 1],
      ["D", 0],
    ]);
    expect(rows?.some((row) => row.isKey)).toBe(false);
  });

  it("marks the key once the answer is showing", () => {
    const rows = chartRows(distribution, true);
    expect(rows?.filter((row) => row.isKey).map((row) => row.letter)).toEqual(["A"]);
  });

  it("is nothing for a kind of result that is not one bar per option", () => {
    expect(chartRows(null, true)).toBeNull();
    expect(chartRows(distributionFor(matrix, []), true)).toBeNull();
  });
});
