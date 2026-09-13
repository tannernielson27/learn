import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import {
  emptyMultipleChoiceForm,
  multipleChoiceFormFromStored,
  toMultipleChoiceForm,
} from "./multipleChoice";

const ROW_ID = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

describe("multipleChoiceFormFromStored", () => {
  it("opens a complete stored item exactly as the form mapping would", () => {
    const item = multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical);
    expect(multipleChoiceFormFromStored(item, ROW_ID)).toEqual(toMultipleChoiceForm(item));
  });

  it("opens a brand-new draft as a blank form named by its row", () => {
    const fresh = {
      type: "multiple_choice",
      stem: { kind: "markdown", value: "" },
      answerKey: {},
      scoring: {},
      tags: [],
      version: 1,
    };
    expect(multipleChoiceFormFromStored(fresh, ROW_ID)).toEqual(emptyMultipleChoiceForm(ROW_ID));
  });

  it("keeps what a half-written draft already has", () => {
    const partial = {
      type: "multiple_choice",
      id: "mc_draft",
      stem: { kind: "markdown", value: "Which action comes first?" },
      content: {
        options: [
          { id: "opt_a", label: "Assess" },
          { id: "opt_b", label: "" },
        ],
      },
      answerKey: { correctOptionId: "opt_b" },
      rationale: { general: { kind: "markdown", value: "Because." } },
      scoring: {},
      tags: ["cardiac"],
      version: 2,
    };
    const form = multipleChoiceFormFromStored(partial, ROW_ID);
    expect(form).toMatchObject({
      id: "mc_draft",
      stem: "Which action comes first?",
      correctOptionId: "opt_b",
      rationaleGeneral: "Because.",
      tags: ["cardiac"],
      version: 2,
    });
    expect(form.options.map((option) => option.label)).toEqual(["Assess", ""]);
  });

  it("ignores malformed pieces instead of throwing", () => {
    const junk = { stem: 5, content: { options: "nope" }, answerKey: null, tags: "x", version: -3 };
    expect(multipleChoiceFormFromStored(junk, ROW_ID)).toEqual(emptyMultipleChoiceForm(ROW_ID));
    expect(multipleChoiceFormFromStored(null, ROW_ID)).toEqual(emptyMultipleChoiceForm(ROW_ID));
  });
});
