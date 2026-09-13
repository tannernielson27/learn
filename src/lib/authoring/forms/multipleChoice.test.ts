import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import {
  emptyMultipleChoiceForm,
  fromMultipleChoiceForm,
  toMultipleChoiceForm,
} from "./multipleChoice";

const multipleChoiceFixture = FIXTURES.multiple_choice;
const parse = (input: unknown) => multipleChoiceItemSchema.parse(input);

describe("multiple choice form mapping", () => {
  it.each([
    ["canonical", multipleChoiceFixture.canonical],
    ["edge", multipleChoiceFixture.edge],
  ])("round-trips the %s fixture: item -> form -> item", (_name, fixture) => {
    const item = parse(fixture);
    expect(parse(fromMultipleChoiceForm(toMultipleChoiceForm(item)))).toEqual(item);
  });

  it("keeps per-option rationale attached to its option", () => {
    const form = toMultipleChoiceForm(parse(multipleChoiceFixture.canonical));
    expect(form.options[1]).toMatchObject({
      id: "opt_b",
      rationale: "More fluid worsens an already overloaded circulation.",
    });
  });

  it("leaves out empty rationale rather than storing blank text", () => {
    const form = toMultipleChoiceForm(parse(multipleChoiceFixture.canonical));
    const cleared = {
      ...form,
      rationaleGeneral: "  ",
      options: form.options.map((option) => ({ ...option, rationale: "" })),
    };
    expect(fromMultipleChoiceForm(cleared).rationale).toEqual({});
  });

  it("starts a new item with four blank options and nothing marked correct", () => {
    const form = emptyMultipleChoiceForm("mc_new");
    expect(form.options).toHaveLength(4);
    expect(new Set(form.options.map((option) => option.id)).size).toBe(4);
    expect(form.correctOptionId).toBe("");
    expect(form.stem).toBe("");
    expect(multipleChoiceItemSchema.safeParse(fromMultipleChoiceForm(form)).success).toBe(false);
  });
});
