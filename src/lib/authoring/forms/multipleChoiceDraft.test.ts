import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { emptyMultipleChoiceForm, toMultipleChoiceForm } from "./multipleChoice";
import { parseMultipleChoiceDraft } from "./multipleChoiceDraft";

const ROW_ID = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

describe("parseMultipleChoiceDraft", () => {
  it("accepts a blank new form, because drafts may be incomplete", () => {
    const result = parseMultipleChoiceDraft(emptyMultipleChoiceForm(ROW_ID));
    expect(result.ok).toBe(true);
  });

  it("accepts a complete form unchanged", () => {
    const form = toMultipleChoiceForm(
      multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical),
    );
    expect(parseMultipleChoiceDraft(form)).toEqual({ ok: true, values: form });
  });

  it.each([
    ["not an object", "nope"],
    ["options not a list", { ...emptyMultipleChoiceForm(ROW_ID), options: "x" }],
    [
      "too many options",
      {
        ...emptyMultipleChoiceForm(ROW_ID),
        options: Array.from({ length: 7 }, (_, i) => ({
          id: `opt_${i}`,
          label: "",
          rationale: "",
        })),
      },
    ],
    [
      "an option id with spaces",
      { ...emptyMultipleChoiceForm(ROW_ID), options: [{ id: "bad id", label: "", rationale: "" }] },
    ],
    [
      "a stem beyond the size limit",
      { ...emptyMultipleChoiceForm(ROW_ID), stem: "a".repeat(20_001) },
    ],
    [
      "an unknown extra field",
      { ...emptyMultipleChoiceForm(ROW_ID), answerKey: { correctOptionId: "opt_a" } },
    ],
  ])("rejects %s", (_name, input) => {
    expect(parseMultipleChoiceDraft(input)).toEqual({
      ok: false,
      error:
        "The draft could not be saved because part of it is not valid. Reload the page and try again.",
    });
  });
});
