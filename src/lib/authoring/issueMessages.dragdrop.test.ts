import { describe, expect, it } from "vitest";
import { emptyDragDropForm, fromDragdropClozeForm } from "@/lib/authoring/forms/dragdrop";
import { dragdropClozeItemSchema } from "@/lib/ngn/schemas";
import { describeIssues } from "./issueMessages";

const problems = (input: unknown) => {
  const parsed = dragdropClozeItemSchema.safeParse(input);
  return parsed.success ? [] : describeIssues(parsed.error.issues, "dragdrop_cloze");
};

const filled = () => ({
  ...emptyDragDropForm("dcz_new"),
  stem: "Fill in the blanks.",
  sentence: "Give {{b1}} then {{b2}}.",
  blanks: [
    { id: "b1", correctTokenId: "t1", rationale: "" },
    { id: "b2", correctTokenId: "t2", rationale: "" },
  ],
  bank: ["oxygen", "fluids", "rest", "food"].map((label, index) => ({
    id: `t${index + 1}`,
    label,
  })),
});

describe("drag-and-drop problems", () => {
  it("has nothing to say about a valid item", () => {
    expect(problems(fromDragdropClozeForm(filled()))).toEqual([]);
  });

  it("asks for words by number", () => {
    const form = filled();
    const bank = form.bank.map((token, index) => (index === 2 ? { ...token, label: "" } : token));
    expect(problems(fromDragdropClozeForm({ ...form, bank }))).toContainEqual({
      field: "bank.2.label",
      message: "Word 3 needs text.",
    });
  });

  it("asks for a correct word per blank", () => {
    const form = filled();
    const blanks = [form.blanks[0], { ...form.blanks[1], correctTokenId: "" }];
    expect(problems(fromDragdropClozeForm({ ...form, blanks }))).toContainEqual({
      field: "blanks.1.correct",
      message: "Choose the correct word for blank 2.",
    });
  });

  it("refuses one word for two blanks unless words may be reused", () => {
    const form = filled();
    const blanks = form.blanks.map((entry) => ({ ...entry, correctTokenId: "t1" }));
    expect(problems(fromDragdropClozeForm({ ...form, blanks }))).toContainEqual({
      field: "blanks.1.correct",
      message:
        "Blank 2 uses the same word as another blank. Choose a different word, or let words be reused.",
    });
    expect(problems(fromDragdropClozeForm({ ...form, blanks, reusable: true }))).toEqual([]);
  });

  it("asks for a bigger bank", () => {
    const form = filled();
    expect(
      problems(fromDragdropClozeForm({ ...form, bank: form.bank.slice(0, 3) })),
    ).toContainEqual({ field: "bank", message: "Add at least 4 words to the word bank." });
  });
});
