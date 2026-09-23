import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { distributionFor } from "./index";

const bowtie = itemSchema.parse(FIXTURES.bowtie.canonical);

describe("slots distribution (bowtie)", () => {
  it("counts each slot against its own column of choices", () => {
    const responses = [
      {
        type: "bowtie",
        actionIds: ["act_aspirin", "act_ecg"],
        conditionId: "cond_mi",
        parameterIds: ["par_rhythm", "par_troponin"],
      },
      {
        type: "bowtie",
        actionIds: ["act_ecg", "act_walk"],
        conditionId: "cond_gerd",
        parameterIds: ["par_troponin", "par_bowel"],
      },
      { type: "bowtie", actionIds: [], parameterIds: [] },
      { type: "bowtie", actionIds: ["act_ecg", "act_ecg"], parameterIds: [] },
      // A condition dropped into the actions slot.
      { type: "bowtie", actionIds: ["cond_mi"], parameterIds: [] },
    ];
    expect(distributionFor(bowtie, responses)).toEqual({
      kind: "slots",
      itemId: "bt_sample_1",
      itemType: "bowtie",
      responded: 3,
      unreadable: 2,
      slots: [
        {
          id: "actions",
          label: "Actions to Take",
          capacity: 2,
          unanswered: 1,
          choices: [
            {
              id: "act_ecg",
              label: "Obtain a 12-lead ECG within 10 minutes",
              count: 2,
              correct: true,
            },
            {
              id: "act_aspirin",
              label: "Administer chewable aspirin as prescribed",
              count: 1,
              correct: true,
            },
            {
              id: "act_walk",
              label: "Encourage ambulation to relieve anxiety",
              count: 1,
              correct: false,
            },
            { id: "act_heat", label: "Apply a heating pad to the chest", count: 0, correct: false },
            { id: "act_meal", label: "Offer a full liquid meal", count: 0, correct: false },
          ],
        },
        {
          id: "condition",
          label: "Potential Condition",
          capacity: 1,
          unanswered: 1,
          choices: [
            { id: "cond_mi", label: "Acute myocardial infarction", count: 1, correct: true },
            { id: "cond_gerd", label: "Gastroesophageal reflux", count: 1, correct: false },
            { id: "cond_costo", label: "Costochondritis", count: 0, correct: false },
            { id: "cond_panic", label: "Panic attack", count: 0, correct: false },
          ],
        },
        {
          id: "parameters",
          label: "Parameters to Monitor",
          capacity: 2,
          unanswered: 1,
          choices: [
            { id: "par_troponin", label: "Serial troponin levels", count: 2, correct: true },
            { id: "par_rhythm", label: "Continuous cardiac rhythm", count: 1, correct: true },
            { id: "par_bowel", label: "Bowel sounds", count: 1, correct: false },
            { id: "par_temp", label: "Oral temperature", count: 0, correct: false },
            { id: "par_pupil", label: "Pupil size", count: 0, correct: false },
          ],
        },
      ],
    });
  });
});
