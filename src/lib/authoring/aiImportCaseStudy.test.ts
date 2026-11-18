import { describe, expect, it } from "vitest";
import { sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema } from "@/lib/ngn/schemas";
import {
  caseSteps,
  stepIsKeyed,
  stepOfReason,
  stepType,
  stepsNeedingAttention,
} from "./aiImportCaseStudy";

const whole = caseStudySchema.parse(sampleCaseStudy);
const withoutKey = (step: number) => ({
  ...whole,
  items: whole.items.map((item, index) => {
    if (index !== step - 1) return item;
    return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "answerKey"));
  }),
});

describe("stepOfReason", () => {
  it("reads the step a reason names, from 1, and gives its words without it", () => {
    expect(stepOfReason("Step 3: The source marks no answer.")).toEqual({
      step: 3,
      message: "The source marks no answer.",
    });
  });

  it("reads a batch staged before #593, which named the step by its draft path", () => {
    expect(stepOfReason("steps.2: The source marks no answer.")).toEqual({
      step: 3,
      message: "The source marks no answer.",
    });
    expect(stepOfReason("steps.0.options.1: Too short.")).toEqual({
      step: 1,
      message: "Too short.",
    });
  });

  it("gives no step for a reason about the whole case study", () => {
    expect(stepOfReason("The patient record could not be read.").step).toBeNull();
    expect(stepOfReason("Step 9: no such step.").step).toBeNull();
  });
});

describe("caseSteps", () => {
  it("gives a staged case study's six step questions, or null when it holds none", () => {
    expect(caseSteps(whole)).toHaveLength(6);
    expect(caseSteps(null)).toBeNull();
    expect(caseSteps({ title: "Ectopic" })).toBeNull();
    expect(caseSteps({ items: whole.items.slice(0, 5) })).toBeNull();
    expect(caseSteps({ items: [1, 2, 3, 4, 5, 6] })).toBeNull();
  });
});

describe("stepsNeedingAttention", () => {
  it("lists the steps with no key", () => {
    const item = withoutKey(4);
    expect(stepIsKeyed(item.items[3])).toBe(false);
    expect(stepsNeedingAttention({ item, reasons: [] })).toEqual([{ step: 4, why: "key" }]);
  });

  it("lists a keyed step that was flagged with something a save answers", () => {
    expect(
      stepsNeedingAttention({
        item: whole,
        reasons: [
          { code: "cut_off", message: "Step 2: The question runs past the end." },
          { code: "warning", message: "Step 5: Advice only." },
          { code: "needs_fix", message: "The patient record is not complete yet." },
        ],
      }),
    ).toEqual([{ step: 2, why: "check" }]);
  });

  it("lists nothing for a case study with no step questions, or with a step no editor opens", () => {
    expect(stepsNeedingAttention({ item: null, reasons: [] })).toEqual([]);
    const odd = { ...whole, items: whole.items.map((item) => ({ ...item, type: "essay" })) };
    expect(stepType(odd.items[0]!)).toBeNull();
    expect(stepsNeedingAttention({ item: odd, reasons: [] })).toEqual([]);
  });
});
