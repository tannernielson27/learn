import { describe, expect, it } from "vitest";
import { itemSchema } from "../schemas";
import { fromBowtieDraft, fromOrderedResponseDraft, type BowtieDraft } from "./structured";

// Fictional content, shaped like the owner's samples (ADR 0008); none of it is copied from them.

const codes = (reasons: { code: string }[]) => reasons.map((reason) => reason.code);

describe("ordered_response", () => {
  const draft = {
    type: "ordered_response" as const,
    stem: "Place the steps for inserting a urinary catheter in order.",
    steps: [
      { text: "Insert the catheter" },
      { text: "Perform hand hygiene", rationale: "Hand hygiene comes before any contact." },
      { text: "Cleanse the meatus" },
      { text: "Inflate the balloon" },
    ],
    answer: "B, C, A, D",
  };

  it("keeps the steps in source order and takes the key from the printed order", () => {
    const { item, reasons } = fromOrderedResponseDraft(draft);
    expect(reasons).toEqual([]);
    expect(item.content.items.map((step) => step.id)).toEqual([
      "step_1",
      "step_2",
      "step_3",
      "step_4",
    ]);
    expect(item.answerKey.orderedIds).toEqual(["step_2", "step_3", "step_1", "step_4"]);
    expect(item.content).not.toHaveProperty("partial");
    expect(item.scoring).toEqual({ model: "zero_one", maxPoints: 1 });
    expect(item.rationale?.perElement).toHaveProperty("step_2");
    expect(itemSchema.safeParse(item).success).toBe(true);
  });

  it("reads the order as the steps' own words", () => {
    const { item } = fromOrderedResponseDraft({
      ...draft,
      answer:
        "Perform hand hygiene → Cleanse the meatus → Insert the catheter → Inflate the balloon",
    });
    expect(item.answerKey.orderedIds).toEqual(["step_2", "step_3", "step_1", "step_4"]);
  });

  it("scores by position when the source says so", () => {
    const { item, reasons } = fromOrderedResponseDraft({
      ...draft,
      statedScoring: "1 point for each step in the correct position",
    });
    expect(reasons).toEqual([]);
    expect(item.content.partial).toBe("position");
    expect(item.scoring).toEqual({ model: "zero_one", maxPoints: 4 });
  });

  it("is needs_answer with no printed order", () => {
    const { item, reasons } = fromOrderedResponseDraft({ ...draft, answer: undefined });
    expect(codes(reasons)).toEqual(["needs_answer"]);
    expect(item.answerKey.orderedIds).toEqual([]);
  });

  it.each(["B, C, A", "B, B, A, D", "Z, Y"])(
    "flags a printed order (%j) that does not list every step once",
    (answer) => {
      const { item, reasons } = fromOrderedResponseDraft({ ...draft, answer });
      expect(codes(reasons)).toEqual(["needs_fix"]);
      expect(item.answerKey.orderedIds).toEqual([]);
    },
  );

  it("flags a rule the type cannot use", () => {
    const { reasons } = fromOrderedResponseDraft({ ...draft, statedScoring: "+/-" });
    expect(codes(reasons)).toEqual(["scoring_conflict"]);
  });
});

describe("bowtie", () => {
  const draft: BowtieDraft = {
    type: "bowtie",
    stem: "Complete the diagram for the client.",
    statedScoring: "Scoring Rule: 0/1",
    actions: [
      { text: "Start oxygen *" },
      { text: "Walk the client" },
      { text: "Raise the head of the bed *" },
      { text: "Offer a meal" },
      { text: "Apply heat" },
    ],
    conditions: [
      { text: "Pulmonary embolism *", rationale: "Sudden dyspnea after surgery." },
      { text: "Asthma" },
      { text: "Anxiety" },
      { text: "Reflux" },
    ],
    parameters: [
      { text: "Oxygen saturation *" },
      { text: "Bowel sounds" },
      { text: "Heart rate *" },
      { text: "Pupils" },
      { text: "Appetite" },
    ],
  };

  it("keys each column from its marks", () => {
    const { item, reasons } = fromBowtieDraft(draft);
    expect(reasons).toEqual([]);
    expect(item.answerKey).toEqual({
      actionIds: ["act_1", "act_3"],
      conditionId: "cond_1",
      parameterIds: ["par_1", "par_3"],
    });
    expect(item.content.actions[0]).toEqual({ id: "act_1", label: "Start oxygen" });
    expect(item.content).not.toHaveProperty("labels");
    expect(item.rationale?.perElement).toHaveProperty("cond_1");
    expect(item.scoring).toEqual({ model: "zero_one", maxPoints: 5 });
    expect(itemSchema.safeParse(item).success).toBe(true);
  });

  it("an unmarked bowtie is needs_answer with an empty key", () => {
    const strip = (column: BowtieDraft["actions"]) =>
      column.map((choice) => ({ text: choice.text.replace(" *", "") }));
    const { item, reasons } = fromBowtieDraft({
      ...draft,
      actions: strip(draft.actions),
      conditions: strip(draft.conditions),
      parameters: strip(draft.parameters),
    });
    expect(codes(reasons)).toEqual(["needs_answer"]);
    expect(item.answerKey).toEqual({ actionIds: [], conditionId: "", parameterIds: [] });
  });

  it("flags a column with the wrong number of marks", () => {
    const { item, reasons } = fromBowtieDraft({
      ...draft,
      conditions: draft.conditions.map((choice) => ({
        text: `${choice.text.replace(" *", "")} *`,
      })),
    });
    expect(reasons).toEqual([
      {
        code: "needs_fix",
        message: "The source marks 4 condition; a bowtie needs 1.",
        path: ["conditions"],
      },
    ]);
    expect(item.answerKey.conditionId).toBe("");
  });

  it("keeps headings the source prints, and drops blank ones", () => {
    const { item } = fromBowtieDraft({
      ...draft,
      labels: { actions: "  Nursing  actions ", condition: "", parameters: undefined },
    });
    expect(item.content.labels).toEqual({ actions: "Nursing actions" });
    const parsed = itemSchema.parse(item);
    expect(parsed.type === "bowtie" && parsed.content.labels).toEqual({
      actions: "Nursing actions",
      condition: "Potential Condition",
      parameters: "Parameters to Monitor",
    });
  });
});
