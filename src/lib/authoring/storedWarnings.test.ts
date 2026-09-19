import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { toItemRow } from "@/lib/supabase/itemRows";
import { storedWarningCount } from "./storedWarnings";

const rowOf = (input: unknown) => toItemRow(itemSchema.parse(input));

describe("storedWarningCount", () => {
  it("is zero for a stored item with nothing to warn about", () => {
    expect(storedWarningCount(rowOf(FIXTURES.multiple_choice.canonical))).toBe(0);
  });

  it("counts every quality warning, the missing rationale among them", () => {
    const base = FIXTURES.multiple_response.canonical;
    const row = rowOf({
      ...base,
      stem: { kind: "markdown", value: "A client has pneumonia." },
      answerKey: { correctOptionIds: base.content.options.map((option) => option.id) },
      rationale: {},
    });
    // The stem, every option correct, no per-option explanations, no rationale.
    expect(storedWarningCount(row)).toBe(4);
  });

  it("is zero for an unfinished draft, whose problems its editor lists instead", () => {
    const row = rowOf(FIXTURES.multiple_choice.canonical);
    expect(storedWarningCount({ ...row, answer_key: {}, rationale: {} })).toBe(0);
  });
});
