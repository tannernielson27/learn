import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item, type ItemType } from "@/lib/ngn/schemas";
import { distributionFor } from "./index";
import type { BlankCounts } from "./types";

const canonical = (type: ItemType): Item => itemSchema.parse(FIXTURES[type].canonical);

const counts = (blanks: BlankCounts[]) =>
  blanks.map((blank) => ({
    id: blank.id,
    label: blank.label,
    unanswered: blank.unanswered,
    choices: blank.choices.map((choice) => [choice.id, choice.count, choice.correct]),
  }));

describe("blanks distributions", () => {
  it("counts a drop-down cloze blank by blank, with each blank's own choices", () => {
    const responses = [
      {
        type: "dropdown_cloze",
        blanks: [
          { blankId: "blank_1", choiceId: "b1_a" },
          { blankId: "blank_2", choiceId: "b2_a" },
        ],
      },
      {
        type: "dropdown_cloze",
        blanks: [
          { blankId: "blank_1", choiceId: "b1_a" },
          { blankId: "blank_2", choiceId: "b2_c" },
        ],
      },
      { type: "dropdown_cloze", blanks: [{ blankId: "blank_1", choiceId: "b1_b" }] },
      // A real choice, but from the other blank's list.
      { type: "dropdown_cloze", blanks: [{ blankId: "blank_1", choiceId: "b2_a" }] },
    ];
    const result = distributionFor(canonical("dropdown_cloze"), responses);
    if (result.kind !== "blanks") throw new Error(`expected blanks, got ${result.kind}`);
    expect(result).toMatchObject({
      itemId: "ddc_sample_1",
      itemType: "dropdown_cloze",
      responded: 3,
      unreadable: 1,
    });
    expect(result.blanks[0]?.choices[0]?.label).toBe("cardiac dysrhythmia");
    expect(counts(result.blanks)).toEqual([
      {
        id: "blank_1",
        label: "Blank 1",
        unanswered: 0,
        choices: [
          ["b1_a", 2, true],
          ["b1_b", 1, false],
          ["b1_c", 0, false],
        ],
      },
      {
        id: "blank_2",
        label: "Blank 2",
        unanswered: 1,
        choices: [
          ["b2_a", 1, true],
          ["b2_b", 0, false],
          ["b2_c", 1, false],
        ],
      },
    ]);
  });

  it("counts a drop-down table row by row, labelled by the row", () => {
    const responses = [
      {
        type: "dropdown_table",
        rows: [
          { rowId: "row_digoxin", choiceId: "dig_a" },
          { rowId: "row_insulin", choiceId: "ins_a" },
          { rowId: "row_metoprolol", choiceId: "met_a" },
        ],
      },
      {
        type: "dropdown_table",
        rows: [
          { rowId: "row_digoxin", choiceId: "dig_b" },
          { rowId: "row_insulin", choiceId: "ins_a" },
        ],
      },
      { type: "dropdown_table", rows: [] },
    ];
    const result = distributionFor(canonical("dropdown_table"), responses);
    if (result.kind !== "blanks") throw new Error(`expected blanks, got ${result.kind}`);
    expect(result).toMatchObject({ responded: 3, unreadable: 0 });
    expect(result.blanks[0]?.choices[0]?.label).toBe("Check apical pulse for one full minute");
    expect(counts(result.blanks)).toEqual([
      {
        id: "row_digoxin",
        label: "Digoxin 0.125 mg PO",
        unanswered: 1,
        choices: [
          ["dig_a", 1, true],
          ["dig_b", 1, false],
          ["dig_c", 0, false],
        ],
      },
      {
        id: "row_insulin",
        label: "Insulin lispro 4 units subcut",
        unanswered: 1,
        choices: [
          ["ins_a", 2, true],
          ["ins_b", 0, false],
          ["ins_c", 0, false],
        ],
      },
      {
        id: "row_metoprolol",
        label: "Metoprolol 25 mg PO",
        unanswered: 2,
        choices: [
          ["met_a", 1, true],
          ["met_b", 0, false],
          ["met_c", 0, false],
        ],
      },
    ]);
  });

  it("counts a drag-and-drop cloze against the whole word bank for every blank", () => {
    const responses = [
      {
        type: "dragdrop_cloze",
        blanks: [
          { blankId: "blank_1", tokenId: "tok_saba" },
          { blankId: "blank_2", tokenId: "tok_fowler" },
        ],
      },
      {
        type: "dragdrop_cloze",
        blanks: [
          { blankId: "blank_1", tokenId: "tok_fowler" },
          { blankId: "blank_2", tokenId: "tok_saba" },
        ],
      },
      { type: "dragdrop_cloze", blanks: [{ blankId: "blank_1", tokenId: "tok_ics" }] },
      { type: "dragdrop_cloze", blanks: [{ blankId: "blank_9", tokenId: "tok_saba" }] },
    ];
    const result = distributionFor(canonical("dragdrop_cloze"), responses);
    if (result.kind !== "blanks") throw new Error(`expected blanks, got ${result.kind}`);
    expect(result).toMatchObject({ responded: 3, unreadable: 1 });
    expect(result.blanks[1]?.choices[2]?.label).toBe("high Fowler position");
    expect(counts(result.blanks)).toEqual([
      {
        id: "blank_1",
        label: "Blank 1",
        unanswered: 0,
        choices: [
          ["tok_saba", 1, true],
          ["tok_ics", 1, false],
          ["tok_fowler", 1, false],
          ["tok_supine", 0, false],
          ["tok_anti", 0, false],
        ],
      },
      {
        id: "blank_2",
        label: "Blank 2",
        unanswered: 1,
        choices: [
          ["tok_saba", 1, false],
          ["tok_ics", 0, false],
          ["tok_fowler", 1, true],
          ["tok_supine", 0, false],
          ["tok_anti", 0, false],
        ],
      },
    ]);
  });

  it("reads a response that fills one blank twice as unreadable", () => {
    const responses = [
      {
        type: "dropdown_cloze",
        blanks: [
          { blankId: "blank_1", choiceId: "b1_a" },
          { blankId: "blank_1", choiceId: "b1_b" },
        ],
      },
    ];
    expect(distributionFor(canonical("dropdown_cloze"), responses)).toMatchObject({
      responded: 0,
      unreadable: 1,
    });
  });
});
