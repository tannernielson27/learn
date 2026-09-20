// #56: items that score row by row hand each row's subtotal back with the result, so a renderer
// never re-derives points from the answer key.
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import { ITEM_TYPES } from "../labels";
import {
  highlightTableItemSchema,
  ITEM_SCHEMAS,
  matrixMultipleResponseItemSchema,
  multipleResponseGroupingItemSchema,
  type Item,
} from "../schemas";
import { scoreItem } from ".";

const GROUPED_TYPES = [
  "matrix_multiple_response",
  "multiple_response_grouping",
  "highlight_table",
] as const;

describe("per-row subtotals", () => {
  it("matrix multiple response names every key row", () => {
    const item = matrixMultipleResponseItemSchema.parse(
      FIXTURES.matrix_multiple_response.canonical,
    );
    const [first, ...rest] = item.answerKey.rows;
    const result = scoreItem(item, {
      type: "matrix_multiple_response",
      rows: [{ rowId: first.rowId, columnIds: [...first.correctColumnIds] }],
    });
    expect(result.groups?.map((g) => g.groupId)).toEqual(item.answerKey.rows.map((r) => r.rowId));
    expect(result.groups?.[0]).toEqual({
      groupId: first.rowId,
      points: first.correctColumnIds.length,
      maxPoints: first.correctColumnIds.length,
    });
    // Unanswered rows score zero out of what they were worth.
    for (const keyRow of rest) {
      expect(result.groups?.find((g) => g.groupId === keyRow.rowId)).toEqual({
        groupId: keyRow.rowId,
        points: 0,
        maxPoints: keyRow.correctColumnIds.length,
      });
    }
  });

  it("multiple response grouping names every key row", () => {
    const item = multipleResponseGroupingItemSchema.parse(
      FIXTURES.multiple_response_grouping.canonical,
    );
    const result = scoreItem(item, {
      type: "multiple_response_grouping",
      rows: item.answerKey.rows.map((r) => ({
        rowId: r.rowId,
        optionIds: [...r.correctOptionIds],
      })),
    });
    expect(result.groups?.map((g) => g.groupId)).toEqual(item.answerKey.rows.map((r) => r.rowId));
    expect(result.groups?.every((g) => g.points === g.maxPoints)).toBe(true);
  });

  it("highlight table names every content row when it scores per row", () => {
    const item = highlightTableItemSchema.parse(FIXTURES.highlight_table.canonical);
    expect(item.content.scorePerRow).toBe(true);
    const result = scoreItem(item, { type: "highlight_table", spanIds: [] });
    expect(result.groups?.map((g) => g.groupId)).toEqual(item.content.rows.map((r) => r.id));
  });

  it("highlight table has no rows to report when it scores as a whole", () => {
    const item = highlightTableItemSchema.parse(FIXTURES.highlight_table.edge);
    expect(item.content.scorePerRow).toBe(false);
    expect(scoreItem(item, { type: "highlight_table", spanIds: [] }).groups).toBeUndefined();
  });

  it("reports a row that over-selected as zero, not as its negative raw total", () => {
    const item = matrixMultipleResponseItemSchema.parse(
      FIXTURES.matrix_multiple_response.canonical,
    );
    const [first] = item.answerKey.rows;
    const everyColumn = item.content.columns.map((c) => c.id);
    const result = scoreItem(item, {
      type: "matrix_multiple_response",
      rows: [{ rowId: first.rowId, columnIds: everyColumn }],
    });
    const group = result.groups?.find((g) => g.groupId === first.rowId);
    expect(group?.points).toBeGreaterThanOrEqual(0);
    expect(group?.maxPoints).toBe(first.correctColumnIds.length);
  });

  it("leaves groups off every item type that does not score by row", () => {
    for (const type of ITEM_TYPES) {
      if ((GROUPED_TYPES as readonly string[]).includes(type)) continue;
      const item = ITEM_SCHEMAS[type].parse(FIXTURES[type].canonical) as Item;
      const [firstCase] = FIXTURES[type].cases;
      expect(scoreItem(item, firstCase.response).groups).toBeUndefined();
    }
  });
});
