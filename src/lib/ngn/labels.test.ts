import { describe, expect, it } from "vitest";
import { ITEM_TYPE_LABELS, ITEM_TYPES } from "./labels";

describe("ITEM_TYPE_LABELS (#563)", () => {
  it("names every type in sentence case: one capital, at the start", () => {
    for (const type of ITEM_TYPES) {
      const label = ITEM_TYPE_LABELS[type];
      expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
      expect(label.slice(1)).toBe(label.slice(1).toLowerCase());
    }
  });

  it("keeps the names the catalogue uses, in the interface's case", () => {
    expect(ITEM_TYPE_LABELS.multiple_choice).toBe("Multiple choice");
    expect(ITEM_TYPE_LABELS.multiple_response).toBe("Extended multiple response");
    expect(ITEM_TYPE_LABELS.dropdown_cloze).toBe("Drop-down cloze");
    expect(ITEM_TYPE_LABELS.dragdrop_rationale).toBe("Drag-and-drop rationale");
    expect(ITEM_TYPE_LABELS.bowtie).toBe("Bowtie");
  });
});
