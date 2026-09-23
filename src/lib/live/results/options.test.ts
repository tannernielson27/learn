import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { distributionFor } from "./index";

const canonical = (type: "multiple_choice" | "multiple_response"): Item =>
  itemSchema.parse(FIXTURES[type].canonical);

describe("options distributions", () => {
  it("counts a multiple-choice room, one pick each", () => {
    const responses = [
      { type: "multiple_choice", optionId: "opt_a" },
      { type: "multiple_choice", optionId: "opt_c" },
      { type: "multiple_choice", optionId: "opt_a" },
      { type: "multiple_choice" },
      "not a response",
      { type: "multiple_choice", optionId: "opt_z" },
      { type: "multiple_response", optionIds: ["opt_a"] },
    ];
    expect(distributionFor(canonical("multiple_choice"), responses)).toEqual({
      kind: "options",
      itemId: "mc_sample_1",
      itemType: "multiple_choice",
      selection: "single",
      responded: 4,
      unreadable: 3,
      unanswered: 1,
      options: [
        {
          id: "opt_a",
          label: "Auscultate the lungs and assess oxygen saturation",
          count: 2,
          correct: true,
        },
        {
          id: "opt_b",
          label: "Encourage the client to increase oral fluids",
          count: 0,
          correct: false,
        },
        {
          id: "opt_c",
          label: "Document the weight and reassess tomorrow",
          count: 1,
          correct: false,
        },
        {
          id: "opt_d",
          label: "Teach the client about low-sodium food choices",
          count: 0,
          correct: false,
        },
      ],
    });
  });

  it("counts a select-all room, each respondent once per option", () => {
    const responses = [
      { type: "multiple_response", optionIds: ["opt_a", "opt_b", "opt_d"] },
      { type: "multiple_response", optionIds: ["opt_a", "opt_c"] },
      { type: "multiple_response", optionIds: ["opt_b", "opt_d", "opt_d"] },
      { type: "multiple_response", optionIds: [] },
      { type: "multiple_response", optionIds: "opt_a" },
    ];
    const result = distributionFor(canonical("multiple_response"), responses);
    expect(result).toMatchObject({
      kind: "options",
      itemId: "mr_sample_1",
      itemType: "multiple_response",
      selection: "multiple",
      responded: 4,
      unreadable: 1,
      unanswered: 1,
    });
    expect(result.kind === "options" && result.options).toEqual([
      { id: "opt_a", label: "Respiratory rate 28 breaths/min", count: 2, correct: true },
      { id: "opt_b", label: "Oxygen saturation 89% on room air", count: 2, correct: true },
      { id: "opt_c", label: "Temperature 37.2 °C (99 °F)", count: 1, correct: false },
      { id: "opt_d", label: "New confusion per family", count: 2, correct: true },
      { id: "opt_e", label: "Productive cough with yellow sputum", count: 0, correct: false },
      { id: "opt_f", label: "Blood pressure 118/74 mm Hg", count: 0, correct: false },
    ]);
  });
});
