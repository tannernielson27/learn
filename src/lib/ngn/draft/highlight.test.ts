import { describe, expect, it } from "vitest";
import { itemSchema } from "../schemas";
import {
  fromHighlightTableDraft,
  fromHighlightTextDraft,
  type HighlightTableDraft,
  type HighlightTextDraft,
} from ".";

const codes = (reasons: { code: string }[]) => reasons.map((reason) => reason.code);

// Fictional, shaped like the owner's Preeclampsia highlight step: whole finding cells keyed.
const preeclampsia: HighlightTableDraft = {
  type: "highlight_table",
  stem: "Click to highlight the findings that require follow-up.",
  columns: ["Assessment", "Findings"],
  rows: [
    { cells: ["Blood pressure", "[[span: 168/112 mm Hg*]]"] },
    { cells: ["Neurologic", "[[span: Headache rated 7/10 *]]"] },
    { cells: ["Vision", "[[span: Seeing spots ✓]]"] },
    { cells: ["Reflexes", "[[span: 3+ with 2 beats of clonus*]]"] },
    { cells: ["Fetal heart rate", "[[span: 140 beats/min]]"] },
    { cells: ["Urine", "[[span: Clear yellow]]"] },
  ],
  statedScoring: "Scoring Rule: +/-",
};

describe("highlight_table", () => {
  it("turns the Preeclampsia-shaped table into a highlight_table with 4 keyed cells", () => {
    const { item, reasons } = fromHighlightTableDraft(preeclampsia, { cjmmStep: 1 });
    expect(reasons).toEqual([]);
    const parsed = itemSchema.parse(item);
    expect(parsed.type).toBe("highlight_table");
    expect(parsed).toMatchObject({
      answerKey: { correctSpanIds: ["span_1", "span_2", "span_3", "span_4"] },
      scoring: { model: "plus_minus", maxPoints: 4 },
      content: { scorePerRow: false },
    });
    expect(item.content.rows[0]).toEqual({
      id: "row_1",
      cells: [
        [{ kind: "text", value: "Blood pressure" }],
        [{ kind: "span", spanId: "span_1", value: "168/112 mm Hg" }],
      ],
    });
  });

  it("scores per row when the source says so", () => {
    const { item } = fromHighlightTableDraft({
      ...preeclampsia,
      statedScoring: "Scoring Rule: +/- per row",
    });
    expect(item.content.scorePerRow).toBe(true);
  });

  it("flags a 0/1 rule, which highlight items cannot use", () => {
    const { item, reasons } = fromHighlightTableDraft({
      ...preeclampsia,
      statedScoring: "Scoring Rule: 0/1",
    });
    expect(codes(reasons)).toEqual(["scoring_conflict"]);
    expect(item.scoring.model).toBe("plus_minus");
  });

  it("flags an unreadable marker with the cell it is in", () => {
    const { reasons } = fromHighlightTableDraft({
      ...preeclampsia,
      rows: [...preeclampsia.rows, { cells: ["Edema", "[[blank: 2+]]"] }],
    });
    expect(reasons).toEqual([
      expect.objectContaining({ code: "needs_fix", path: ["rows", 6, "cells", 1] }),
    ]);
  });
});

const note: HighlightTextDraft = {
  type: "highlight_text",
  stem: "Highlight the findings that require follow-up.",
  passage:
    "0115: [[span: Pain now 8/10]] and constant. [[span: Pain at the tip of the left shoulder]]. [[span: Skin warm and dry]].",
};

describe("highlight_text", () => {
  it("reads a key printed apart, one phrase per line, and rationales by phrase", () => {
    const { item, reasons } = fromHighlightTextDraft({
      ...note,
      answer: "Pain now 8/10\npain at the tip of the left shoulder.",
      rationales: [{ phrase: "Skin warm and dry", rationale: "Expected." }],
    });
    expect(reasons).toEqual([]);
    expect(itemSchema.parse(item)).toMatchObject({
      content: {
        passage: [
          { kind: "text", value: "0115: " },
          { kind: "span", spanId: "span_1", value: "Pain now 8/10" },
          { kind: "text", value: " and constant. " },
          { kind: "span", spanId: "span_2", value: "Pain at the tip of the left shoulder" },
          { kind: "text", value: ". " },
          { kind: "span", spanId: "span_3", value: "Skin warm and dry" },
          { kind: "text", value: "." },
        ],
      },
      answerKey: { correctSpanIds: ["span_1", "span_2"] },
      rationale: { perElement: { span_3: { kind: "markdown", value: "Expected." } } },
      scoring: { maxPoints: 2 },
    });
  });

  it("never drops a phrase it cannot find: the key and the rationale say which", () => {
    const { item, reasons } = fromHighlightTextDraft({
      ...note,
      answer: "Pain now 8/10; Pale and diaphoretic",
      rationales: [
        { phrase: "Rebound tenderness", rationale: "Peritoneal irritation." },
        { phrase: "Pain now 8/10", rationale: "   " },
      ],
    });
    expect(reasons.map((reason) => [reason.code, reason.message])).toEqual([
      [
        "needs_fix",
        'The keyed phrase "Pale and diaphoretic" is not one of the passage\'s [[span]] phrases.',
      ],
      [
        "needs_fix",
        'The rationale for "Rebound tenderness" names a phrase the passage does not mark.',
      ],
    ]);
    expect(item.answerKey.correctSpanIds).toEqual(["span_1"]);
  });

  it("flags marks that disagree with the printed key", () => {
    const { reasons } = fromHighlightTextDraft({
      ...note,
      passage: note.passage.replace("8/10]]", "8/10*]]"),
      answer: "Skin warm and dry",
    });
    expect(reasons.map((reason) => reason.message)).toEqual([
      "The phrases' marks and the key printed in the source disagree.",
    ]);
  });

  it("keys a repeated phrase once each, in reading order", () => {
    const { item } = fromHighlightTextDraft({
      ...note,
      passage: "[[span: pale]] at 0100, [[span: pale]] at 0130, [[span: warm]].",
      answer: "pale\npale",
    });
    expect(item.answerKey.correctSpanIds).toEqual(["span_1", "span_2"]);
  });

  it("needs an answer when nothing is marked, and a fix when nothing can be highlighted", () => {
    expect(codes(fromHighlightTextDraft(note).reasons)).toEqual(["needs_answer"]);
    const empty = fromHighlightTextDraft({ ...note, passage: "Pain 8/10. [[span:  ]]" });
    expect(empty.reasons.map((reason) => reason.message)).toEqual([
      "A [[span]] marker holds no phrase.",
      "No phrase is marked as [[span]], so nothing can be highlighted.",
    ]);
    expect(empty.item.content.passage).toEqual([{ kind: "text", value: "Pain 8/10. " }]);
  });
});
