import { describe, expect, it } from "vitest";
import { itemSchema } from "../schemas";
import {
  fromDragdropClozeDraft,
  fromDragdropRationaleDraft,
  fromDropdownClozeDraft,
  fromDropdownRationaleDraft,
  fromDropdownTableDraft,
  type DragdropClozeDraft,
  type DropdownClozeDraft,
  type DropdownTableDraft,
} from ".";

const codes = (reasons: { code: string }[]) => reasons.map((reason) => reason.code);

// Fictional, shaped like the owner's Ectopic step 6: one sentence, two blanks, a stated rule.
const ectopicStep6: DropdownClozeDraft = {
  type: "dropdown_cloze",
  stem: "The nurse reviews the client's status after surgery. Complete the following sentence by choosing from the lists of options.",
  sentence:
    "The client's condition is [[blank: improving* | declining | unchanged]] as evidenced by [[blank: a heart rate of 92* | a pain score of 3/10 | drowsiness]].",
  statedScoring: "Scoring Rule: Rationale",
  rationale: "A heart rate back near baseline shows the bleeding has been controlled.",
};

describe("dropdown_cloze and dropdown_rationale", () => {
  it("turns a two-blank sentence under 'Scoring Rule: Rationale' into a dropdown_rationale", () => {
    const { item, reasons } = fromDropdownClozeDraft(ectopicStep6, { id: "ect_6", cjmmStep: 6 });
    expect(reasons).toEqual([]);
    const parsed = itemSchema.parse(item);
    expect(parsed.type).toBe("dropdown_rationale");
    expect(parsed).toMatchObject({
      id: "ect_6",
      cjmmStep: 6,
      scoring: { model: "rationale", maxPoints: 1 },
      content: {
        tokens: [
          { kind: "text", value: "The client's condition is " },
          { kind: "blank", blankId: "blank_1" },
          { kind: "text", value: " as evidenced by " },
          { kind: "blank", blankId: "blank_2" },
          { kind: "text", value: "." },
        ],
      },
      answerKey: {
        blanks: [
          { blankId: "blank_1", correctChoiceId: "blank_1_a" },
          { blankId: "blank_2", correctChoiceId: "blank_2_a" },
        ],
      },
    });
    expect(parsed.answerKey).not.toHaveProperty("anchorBlankId");
  });

  it("keeps a drop-down cloze with no stated rule, scored 0/1 per blank", () => {
    const { item, reasons } = fromDropdownClozeDraft({ ...ectopicStep6, statedScoring: undefined });
    expect(reasons).toEqual([]);
    expect(item).toMatchObject({
      type: "dropdown_cloze",
      scoring: { model: "zero_one", maxPoints: 2 },
    });
  });

  it("anchors a triad on its first blank and scores it out of 2", () => {
    const { item, reasons } = fromDropdownRationaleDraft({
      ...ectopicStep6,
      type: "dropdown_rationale",
      sentence: `${ectopicStep6.sentence} and [[blank: pallor* | warmth | thirst]]`,
    });
    expect(reasons).toEqual([]);
    expect(item).toMatchObject({
      answerKey: { anchorBlankId: "blank_1" },
      scoring: { model: "rationale", maxPoints: 2 },
    });
  });

  it("flags a rationale rule on a one-blank cloze and keeps 0/1", () => {
    const { item, reasons } = fromDropdownClozeDraft({
      ...ectopicStep6,
      sentence: "Give [[blank: oxygen* | food | water]].",
    });
    expect(item.type).toBe("dropdown_cloze");
    expect(codes(reasons)).toEqual(["scoring_conflict"]);
  });

  it("flags a 0/1 rule stated on a rationale draft", () => {
    const { reasons } = fromDropdownRationaleDraft({
      ...ectopicStep6,
      type: "dropdown_rationale",
      statedScoring: "Scoring Rule: 0/1",
    });
    expect(codes(reasons)).toEqual(["scoring_conflict"]);
  });

  it("reads a key printed apart, one entry per blank", () => {
    const { item, reasons } = fromDropdownClozeDraft({
      type: "dropdown_cloze",
      stem: "Complete the sentence.",
      sentence: "Give [[blank: oxygen | food | water]] then [[blank: rest | walk | eat]].",
      answers: ["A", "walk"],
    });
    expect(reasons).toEqual([]);
    expect(item.answerKey.blanks).toEqual([
      { blankId: "blank_1", correctChoiceId: "blank_1_a" },
      { blankId: "blank_2", correctChoiceId: "blank_2_b" },
    ]);
  });

  it("does not use a printed key whose count does not match the blanks", () => {
    const { reasons } = fromDropdownClozeDraft({
      type: "dropdown_cloze",
      stem: "Complete the sentence.",
      sentence: "Give [[blank: oxygen* | food | water]].",
      answers: ["A", "B"],
    });
    expect(reasons).toEqual([expect.objectContaining({ code: "needs_fix", path: ["answers"] })]);
  });

  it("returns an empty key and needs_answer when the source marks nothing", () => {
    const { item, reasons } = fromDropdownClozeDraft({
      type: "dropdown_cloze",
      stem: "Complete the sentence.",
      sentence: "Give [[blank: oxygen | food | water]].",
    });
    expect(codes(reasons)).toEqual(["needs_answer"]);
    expect(item.answerKey.blanks).toEqual([]);
    expect(itemSchema.safeParse(item).success).toBe(false);
  });

  it("flags a blank with no mark when others have one, and a blank with two", () => {
    const { reasons } = fromDropdownClozeDraft({
      type: "dropdown_cloze",
      stem: "Complete the sentence.",
      sentence:
        "Give [[blank: oxygen* | food* | water]], [[blank: rest | walk | eat]] and [[blank: a* | b | c]].",
    });
    expect(reasons.map((reason) => reason.message)).toEqual([
      "Blank 1 has 2 answers; a drop-down has one.",
      "Blank 2 has no answer in the source.",
    ]);
  });

  it("flags a blank with no choices, a sentence with no blanks, and a marker it cannot read", () => {
    expect(
      fromDropdownClozeDraft({ type: "dropdown_cloze", stem: "x", sentence: "Give [[blank]]." })
        .reasons[0].message,
    ).toBe("Blank 1 lists no choices.");
    expect(
      codes(
        fromDropdownClozeDraft({ type: "dropdown_cloze", stem: "x", sentence: "No blanks here." })
          .reasons,
      ),
    ).toEqual(["needs_fix"]);
    const odd = fromDropdownClozeDraft({
      type: "dropdown_cloze",
      stem: "x",
      sentence: "Give [[gap: a]] and [[span: b]] and [[blank: c* | d | e]] [[.",
    });
    expect(odd.reasons[0].message).toContain('"[[gap: a]]"');
    expect(odd.reasons[0].message).toContain('"[[span: b]]"');
    expect(odd.item.content.tokens[0]).toEqual({ kind: "text", value: "Give gap: a and b and " });
  });

  it("uses per-blank rationales only when there is one per blank", () => {
    const matched = fromDropdownClozeDraft({
      ...ectopicStep6,
      statedScoring: undefined,
      blankRationales: ["Heart rate is the sign.", ""],
    });
    expect(matched.item.rationale?.perElement).toEqual({
      blank_1: { kind: "markdown", value: "Heart rate is the sign." },
    });
    const mismatched = fromDropdownClozeDraft({ ...ectopicStep6, blankRationales: ["one"] });
    expect(codes(mismatched.reasons)).toEqual(["needs_fix"]);
  });
});

const asthma: DragdropClozeDraft = {
  type: "dragdrop_cloze",
  stem: "Drag words from the choices below to fill in each blank.",
  sentence:
    "The nurse should first give [[blank: a short-acting beta agonist]] and then place the client in [[blank: high Fowler position*]].",
  bank: [
    "a short-acting beta agonist",
    "an inhaled corticosteroid",
    "high Fowler position",
    "supine position",
  ],
};

describe("dragdrop_cloze and dragdrop_rationale", () => {
  it("keys each blank from the word written in it, marks or not", () => {
    const { item, reasons } = fromDragdropClozeDraft(asthma);
    expect(reasons).toEqual([]);
    expect(itemSchema.parse(item)).toMatchObject({
      content: { blanks: [{ id: "blank_1" }, { id: "blank_2" }], reusable: false },
      answerKey: {
        blanks: [
          { blankId: "blank_1", correctTokenId: "tok_1" },
          { blankId: "blank_2", correctTokenId: "tok_3" },
        ],
      },
      scoring: { model: "zero_one", maxPoints: 2 },
    });
  });

  it("becomes a dragdrop_rationale under a stated rationale rule, and keeps a reusable bank", () => {
    const { item } = fromDragdropClozeDraft({
      ...asthma,
      reusable: true,
      statedScoring: "Rationale scoring",
    });
    expect(item).toMatchObject({
      type: "dragdrop_rationale",
      content: { reusable: true },
      scoring: { model: "rationale", maxPoints: 1 },
    });
    const triad = fromDragdropRationaleDraft({
      ...asthma,
      type: "dragdrop_rationale",
      sentence: `${asthma.sentence} [[blank: supine position]]`,
    });
    expect(triad.item.answerKey).toMatchObject({ anchorBlankId: "blank_1" });
    expect(triad.item.scoring.maxPoints).toBe(2);
  });

  it("reads a printed key and flags one that disagrees with the blanks", () => {
    const bare = asthma.sentence.replace(/\[\[blank: [^\]]+\]\]/g, "[[blank]]");
    expect(
      fromDragdropClozeDraft({ ...asthma, sentence: bare, answers: ["A", "high Fowler position"] })
        .item.answerKey.blanks,
    ).toEqual([
      { blankId: "blank_1", correctTokenId: "tok_1" },
      { blankId: "blank_2", correctTokenId: "tok_3" },
    ]);
    const clash = fromDragdropClozeDraft({ ...asthma, answers: ["B", "C"] });
    expect(clash.reasons).toEqual([
      expect.objectContaining({ code: "needs_fix", path: ["answers", 0] }),
    ]);
  });

  it("flags a word that is not in the bank", () => {
    const { item, reasons } = fromDragdropClozeDraft({
      ...asthma,
      sentence: "Give [[blank: an antihistamine]] then [[blank: supine position]].",
    });
    expect(reasons.map((reason) => reason.message)).toEqual([
      'The answer for blank 1 ("an antihistamine") is not one of the words in the bank.',
      "Blank 1 has no answer in the source.",
    ]);
    expect(item.answerKey.blanks).toHaveLength(1);
  });

  it("needs an answer when nothing is keyed, and says so when only the bank is marked", () => {
    const bare = asthma.sentence.replace(/\[\[blank: [^\]]+\]\]/g, "[[blank]]");
    expect(codes(fromDragdropClozeDraft({ ...asthma, sentence: bare }).reasons)).toEqual([
      "needs_answer",
    ]);
    const bankOnly = fromDragdropClozeDraft({
      ...asthma,
      sentence: bare,
      bank: [
        "a short-acting beta agonist *",
        "an inhaled corticosteroid",
        "high Fowler position *",
        "supine position",
      ],
    });
    expect(codes(bankOnly.reasons)).toEqual(["needs_fix", "needs_answer"]);
    expect(bankOnly.item.content.bank[0].label).toBe("a short-acting beta agonist");
  });
});

const meds: DropdownTableDraft = {
  type: "dropdown_table",
  stem: "For each medication, select the nursing action before giving it.",
  rowHeading: "Medication",
  choiceHeading: "Nursing action",
  rows: [
    { label: "Digoxin", choices: ["Check apical pulse *", "Check glucose", "Assess pain"] },
    {
      label: "Insulin",
      choices: ["Check apical pulse", "Check glucose", "Assess pain"],
      answer: "B",
      rationale: "Glucose first.",
    },
  ],
};

describe("dropdown_table", () => {
  it("keys each row from its marks or its printed answer", () => {
    const { item, reasons } = fromDropdownTableDraft(meds);
    expect(reasons).toEqual([]);
    expect(itemSchema.parse(item)).toMatchObject({
      content: { columns: { label: "Medication", dropdown: "Nursing action" } },
      answerKey: {
        rows: [
          { rowId: "row_1", correctChoiceId: "row_1_a" },
          { rowId: "row_2", correctChoiceId: "row_2_b" },
        ],
      },
      rationale: { perElement: { row_2: { kind: "markdown", value: "Glucose first." } } },
      scoring: { model: "zero_one", maxPoints: 2 },
    });
  });

  it("needs an answer when no row is keyed, and flags rows with none or two", () => {
    const bare = meds.rows.map((row) => ({
      label: row.label,
      choices: row.choices.map((choice) => choice.replace(" *", "")),
    }));
    expect(codes(fromDropdownTableDraft({ ...meds, rows: bare }).reasons)).toEqual([
      "needs_answer",
    ]);
    const messy = fromDropdownTableDraft({
      ...meds,
      rows: [{ label: "Digoxin", choices: ["A *", "B *", "C"] }, bare[1]],
    });
    expect(messy.reasons.map((reason) => reason.message)).toEqual([
      "Row 1 has 2 answers; a drop-down has one.",
      "Row 2 has no answer in the source.",
    ]);
    expect(
      fromDropdownTableDraft({ ...meds, rows: [{ ...bare[0], answer: "Z" }] }).reasons[0].path,
    ).toEqual(["rows", 0, "answer"]);
    expect(fromDropdownTableDraft({ ...meds, rows: [] }).reasons).toEqual([]);
  });
});
