import { describe, expect, it } from "vitest";
import { ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import { itemCountLabel, sentenceCase } from "./format";

describe("sentenceCase (#563)", () => {
  it("keeps the first capital and lowers the rest of a type's name", () => {
    expect(sentenceCase(ITEM_TYPE_LABELS.multiple_choice)).toBe("Multiple choice");
    expect(sentenceCase(ITEM_TYPE_LABELS.matrix_multiple_choice)).toBe("Matrix multiple choice");
    expect(sentenceCase(ITEM_TYPE_LABELS.dragdrop_cloze)).toBe("Drag-and-drop cloze");
    expect(sentenceCase(ITEM_TYPE_LABELS.bowtie)).toBe("Bowtie");
  });

  it("leaves an empty label empty", () => {
    expect(sentenceCase("")).toBe("");
  });
});

describe("itemCountLabel", () => {
  it("counts one question and many", () => {
    expect(itemCountLabel(1)).toBe("1 question");
    expect(itemCountLabel(3)).toBe("3 questions");
  });
});
