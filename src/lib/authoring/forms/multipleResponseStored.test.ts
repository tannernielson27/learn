import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleResponseItemSchema } from "@/lib/ngn/schemas";
import {
  emptyMultipleResponseForm,
  multipleResponseFormFromStored,
  toMultipleResponseForm,
} from "./multipleResponse";
import { parseMultipleResponseDraft } from "./multipleResponseDraft";

const ROW_ID = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const DRAFT_ERROR =
  "The draft could not be saved because part of it is not valid. Reload the page and try again.";
const complete = () =>
  toMultipleResponseForm(multipleResponseItemSchema.parse(FIXTURES.multiple_response.canonical));

describe("multipleResponseFormFromStored", () => {
  it("opens a complete stored item exactly as the form mapping would", () => {
    const item = multipleResponseItemSchema.parse(FIXTURES.multiple_response.edge);
    expect(multipleResponseFormFromStored(item, ROW_ID)).toEqual(toMultipleResponseForm(item));
  });

  it("opens a brand-new draft as a blank form named by its row", () => {
    const fresh = {
      type: "multiple_response",
      stem: { kind: "markdown", value: "" },
      answerKey: {},
      scoring: {},
      tags: [],
      version: 1,
    };
    expect(multipleResponseFormFromStored(fresh, ROW_ID)).toEqual(
      emptyMultipleResponseForm(ROW_ID),
    );
  });

  it("keeps what a half-written draft already has, including which options are marked", () => {
    const partial = {
      type: "multiple_response",
      stem: { kind: "markdown", value: "Which three?" },
      content: {
        variant: "select_n",
        n: 3,
        options: [
          { id: "opt_a", label: "Obtain cultures" },
          { id: "opt_b", label: "" },
        ],
      },
      answerKey: { correctOptionIds: ["opt_b"] },
      tags: [],
      version: 1,
    };
    const form = multipleResponseFormFromStored(partial, ROW_ID);
    expect(form).toMatchObject({ stem: "Which three?", variant: "select_n", n: 3 });
    expect(form.options.map((option) => [option.label, option.correct])).toEqual([
      ["Obtain cultures", false],
      ["", true],
    ]);
  });

  it("ignores malformed pieces instead of throwing", () => {
    const junk = { stem: 5, content: { variant: "pick", options: "nope" }, answerKey: null };
    expect(multipleResponseFormFromStored(junk, ROW_ID)).toEqual(emptyMultipleResponseForm(ROW_ID));
    expect(multipleResponseFormFromStored(undefined, ROW_ID)).toEqual(
      emptyMultipleResponseForm(ROW_ID),
    );
  });
});

describe("parseMultipleResponseDraft", () => {
  it("accepts a blank new form, because drafts may be incomplete", () => {
    expect(parseMultipleResponseDraft(emptyMultipleResponseForm(ROW_ID)).ok).toBe(true);
  });

  it("accepts a complete form unchanged", () => {
    const form = complete();
    expect(parseMultipleResponseDraft(form)).toEqual({ ok: true, values: form });
  });

  it.each([
    ["not an object", 7],
    ["options not a list", { ...emptyMultipleResponseForm(ROW_ID), options: "x" }],
    [
      "too many options",
      {
        ...emptyMultipleResponseForm(ROW_ID),
        options: Array.from({ length: 11 }, (_, i) => ({
          id: `opt_${i}`,
          label: "",
          correct: false,
          rationale: "",
        })),
      },
    ],
    ["an unknown answer style", { ...emptyMultipleResponseForm(ROW_ID), variant: "pick_some" }],
    ["a count below one", { ...emptyMultipleResponseForm(ROW_ID), n: 0 }],
    [
      "a stem beyond the size limit",
      { ...emptyMultipleResponseForm(ROW_ID), stem: "a".repeat(20_001) },
    ],
    [
      "an unknown extra field",
      { ...emptyMultipleResponseForm(ROW_ID), answerKey: { correctOptionIds: ["opt_a"] } },
    ],
  ])("rejects %s", (_name, input) => {
    expect(parseMultipleResponseDraft(input)).toEqual({ ok: false, error: DRAFT_ERROR });
  });
});
