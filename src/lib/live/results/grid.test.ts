import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item, type ItemType } from "@/lib/ngn/schemas";
import { distributionFor } from "./index";
import type { GridRow } from "./types";

const canonical = (type: ItemType): Item => itemSchema.parse(FIXTURES[type].canonical);

/** `[id, count, correct]` per cell: the labels are checked once per type, below. */
const counts = (rows: GridRow[]) =>
  rows.map((row) => ({
    id: row.id,
    unanswered: row.unanswered,
    cells: row.cells.map((cell) => [cell.id, cell.count, cell.correct]),
  }));

describe("grid distributions", () => {
  it("counts a single-choice matrix row by row", () => {
    const answered = FIXTURES.matrix_multiple_choice.cases.map((c) => c.response);
    const responses = [
      answered[1], // all correct
      answered[2], // two wrong rows and one unanswered
      { type: "matrix_multiple_choice", rows: [] },
      {
        type: "matrix_multiple_choice",
        rows: [
          { rowId: "row_npo", columnId: "col_ind" },
          { rowId: "row_npo", columnId: "col_non" },
        ],
      },
      null,
    ];
    const result = distributionFor(canonical("matrix_multiple_choice"), responses);
    if (result.kind !== "grid") throw new Error(`expected a grid, got ${result.kind}`);
    expect(result).toMatchObject({
      itemId: "mmc_sample_1",
      itemType: "matrix_multiple_choice",
      selection: "single",
      responded: 3,
      unreadable: 2,
      columns: [
        { id: "col_ind", label: "Indicated" },
        { id: "col_contra", label: "Contraindicated" },
        { id: "col_non", label: "Non-essential" },
      ],
    });
    expect(result.rows[0]?.label).toBe("Keep the client NPO initially");
    expect(result.rows[0]?.cells[1]?.label).toBe("Contraindicated");
    expect(counts(result.rows)).toEqual([
      {
        id: "row_npo",
        unanswered: 1,
        cells: [
          ["col_ind", 2, true],
          ["col_contra", 0, false],
          ["col_non", 0, false],
        ],
      },
      {
        id: "row_morphine",
        unanswered: 1,
        cells: [
          ["col_ind", 1, true],
          ["col_contra", 1, false],
          ["col_non", 0, false],
        ],
      },
      {
        id: "row_diet",
        unanswered: 1,
        cells: [
          ["col_ind", 1, false],
          ["col_contra", 1, true],
          ["col_non", 0, false],
        ],
      },
      {
        id: "row_position",
        unanswered: 1,
        cells: [
          ["col_ind", 2, true],
          ["col_contra", 0, false],
          ["col_non", 0, false],
        ],
      },
      {
        id: "row_sodium",
        unanswered: 2,
        cells: [
          ["col_ind", 0, false],
          ["col_contra", 0, false],
          ["col_non", 1, true],
        ],
      },
    ]);
  });

  it("counts a multiple-response matrix, several columns a row", () => {
    const responses = [
      {
        type: "matrix_multiple_response",
        rows: [
          { rowId: "row_weak", columnIds: ["col_stroke"] },
          { rowId: "row_speech", columnIds: ["col_stroke", "col_hypo"] },
          { rowId: "row_glucose", columnIds: ["col_hypo"] },
        ],
      },
      {
        type: "matrix_multiple_response",
        rows: [
          { rowId: "row_weak", columnIds: ["col_stroke", "col_hypo", "col_migraine"] },
          { rowId: "row_glucose", columnIds: ["col_stroke"] },
        ],
      },
      { type: "matrix_multiple_response", rows: [{ rowId: "row_weak", columnIds: ["col_x"] }] },
    ];
    const result = distributionFor(canonical("matrix_multiple_response"), responses);
    if (result.kind !== "grid") throw new Error(`expected a grid, got ${result.kind}`);
    expect(result).toMatchObject({ selection: "multiple", responded: 2, unreadable: 1 });
    expect(counts(result.rows)).toEqual([
      {
        id: "row_weak",
        unanswered: 0,
        cells: [
          ["col_stroke", 2, true],
          ["col_hypo", 1, true],
          ["col_migraine", 1, true],
        ],
      },
      {
        id: "row_speech",
        unanswered: 1,
        cells: [
          ["col_stroke", 1, true],
          ["col_hypo", 1, true],
          ["col_migraine", 0, true],
        ],
      },
      {
        id: "row_glucose",
        unanswered: 0,
        cells: [
          ["col_stroke", 1, false],
          ["col_hypo", 1, true],
          ["col_migraine", 0, false],
        ],
      },
    ]);
  });

  it("counts a grouping item against each row's own options", () => {
    const responses = [
      {
        type: "multiple_response_grouping",
        rows: [
          { rowId: "row_resp", optionIds: ["resp_a", "resp_b"] },
          { rowId: "row_cv", optionIds: ["cv_a"] },
          { rowId: "row_neuro", optionIds: ["neuro_a"] },
        ],
      },
      {
        type: "multiple_response_grouping",
        rows: [
          { rowId: "row_resp", optionIds: ["resp_c"] },
          { rowId: "row_neuro", optionIds: ["neuro_a", "neuro_b"] },
        ],
      },
      // A real option id, but from another row.
      { type: "multiple_response_grouping", rows: [{ rowId: "row_resp", optionIds: ["cv_a"] }] },
    ];
    const result = distributionFor(canonical("multiple_response_grouping"), responses);
    if (result.kind !== "grid") throw new Error(`expected a grid, got ${result.kind}`);
    expect(result).toMatchObject({
      selection: "multiple",
      columns: null,
      responded: 2,
      unreadable: 1,
    });
    expect(result.rows.map((row) => row.label)).toEqual([
      "Respiratory",
      "Cardiovascular",
      "Neurologic",
    ]);
    expect(result.rows[0]?.cells[0]?.label).toBe("Deep, rapid respirations");
    expect(counts(result.rows)).toEqual([
      {
        id: "row_resp",
        unanswered: 0,
        cells: [
          ["resp_a", 1, true],
          ["resp_b", 1, true],
          ["resp_c", 1, false],
        ],
      },
      {
        id: "row_cv",
        unanswered: 1,
        cells: [
          ["cv_a", 1, true],
          ["cv_b", 0, false],
          ["cv_c", 0, true],
        ],
      },
      {
        id: "row_neuro",
        unanswered: 0,
        cells: [
          ["neuro_a", 2, true],
          ["neuro_b", 1, false],
        ],
      },
    ]);
  });

  it("counts a highlighted passage as one row of spans", () => {
    const responses = [
      { type: "highlight_text", spanIds: ["sp_hr", "sp_sat", "sp_urine"] },
      { type: "highlight_text", spanIds: ["sp_hr", "sp_bp"] },
      { type: "highlight_text", spanIds: [] },
      { type: "highlight_text", spanIds: ["sp_nope"] },
    ];
    expect(distributionFor(canonical("highlight_text"), responses)).toEqual({
      kind: "grid",
      itemId: "ht_sample_1",
      itemType: "highlight_text",
      selection: "multiple",
      responded: 3,
      unreadable: 1,
      columns: null,
      rows: [
        {
          id: "passage",
          label: "Passage",
          unanswered: 1,
          cells: [
            { id: "sp_hr", label: "Heart rate 54 and irregular", count: 2, correct: true },
            { id: "sp_bp", label: "Blood pressure 128/78", count: 1, correct: false },
            {
              id: "sp_sat",
              label: "Oxygen saturation 91% on 2 L nasal cannula",
              count: 1,
              correct: true,
            },
            { id: "sp_skin", label: "Skin warm and dry", count: 0, correct: false },
            {
              id: "sp_urine",
              label: "Urine output 15 mL over the past hour",
              count: 1,
              correct: true,
            },
          ],
        },
      ],
    });
  });

  it("counts a highlighted table row by row, labelled by its first cell", () => {
    const responses = [
      { type: "highlight_table", spanIds: ["g1", "s1", "s2", "r1"] },
      { type: "highlight_table", spanIds: ["g1", "g2", "s3", "r1"] },
      { type: "highlight_table", spanIds: ["s1"] },
    ];
    const result = distributionFor(canonical("highlight_table"), responses);
    if (result.kind !== "grid") throw new Error(`expected a grid, got ${result.kind}`);
    expect(result).toMatchObject({ columns: null, responded: 3, unreadable: 0 });
    expect(result.rows.map((row) => row.label)).toEqual([
      "General",
      "Skin and mucous membranes",
      "Renal",
    ]);
    expect(result.rows[0]?.cells[0]?.label).toBe("Lethargic, difficult to arouse");
    expect(counts(result.rows)).toEqual([
      {
        id: "row_general",
        unanswered: 1,
        cells: [
          ["g1", 2, true],
          ["g2", 1, false],
        ],
      },
      {
        id: "row_skin",
        unanswered: 0,
        cells: [
          ["s1", 2, true],
          ["s2", 1, true],
          ["s3", 1, false],
        ],
      },
      {
        id: "row_renal",
        unanswered: 1,
        cells: [
          ["r1", 2, true],
          ["r2", 0, false],
        ],
      },
    ]);
  });
});
