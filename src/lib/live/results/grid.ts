/**
 * Matrices, grouping and the highlight types: a row-by-cell heat map.
 */
import type { HighlightToken, ItemOf } from "@/lib/ngn/schemas";
import { allKnown, countChoices, countEmpty, idSet, noRepeats, readResponses } from "./read";
import type { GridDistribution, GridRow } from "./types";

type GridType = GridDistribution["itemType"];

interface RowDef {
  id: string;
  label: string;
  cells: readonly { id: string; label: string }[];
  correct: ReadonlySet<string>;
}

/** What one respondent selected, row by row. */
type Selection = ReadonlyMap<string, readonly string[]>;

function buildRows(defs: readonly RowDef[], selections: readonly Selection[]): GridRow[] {
  return defs.map((def) => {
    const picks = selections.map((selection) => selection.get(def.id) ?? []);
    return {
      id: def.id,
      label: def.label,
      cells: countChoices(def.cells, picks, def.correct),
      unanswered: countEmpty(picks),
    };
  });
}

function grid(
  item: { id: string; type: GridType },
  parts: Pick<GridDistribution, "selection" | "columns" | "unreadable"> & {
    defs: readonly RowDef[];
    selections: readonly Selection[];
  },
): GridDistribution {
  return {
    kind: "grid",
    itemId: item.id,
    itemType: item.type,
    selection: parts.selection,
    responded: parts.selections.length,
    unreadable: parts.unreadable,
    columns: parts.columns,
    rows: buildRows(parts.defs, parts.selections),
  };
}

const byRow = <E extends { rowId: string }>(
  entries: readonly E[],
  pick: (entry: E) => readonly string[],
): Selection => new Map(entries.map((entry) => [entry.rowId, pick(entry)]));

export function matrixMultipleChoiceDistribution(
  item: ItemOf<"matrix_multiple_choice">,
  raws: readonly unknown[],
): GridDistribution {
  const rowIds = idSet(item.content.rows);
  const columnIds = idSet(item.content.columns);
  const { responses, unreadable } = readResponses(item.type, raws, (r) => {
    const rows = r.rows.map((row) => row.rowId);
    return (
      noRepeats(rows) &&
      allKnown(rows, rowIds) &&
      allKnown(
        r.rows.map((row) => row.columnId),
        columnIds,
      )
    );
  });
  const key = new Map(item.answerKey.rows.map((row) => [row.rowId, row.correctColumnId]));
  const defs = item.content.rows.map((row) => ({
    ...row,
    cells: item.content.columns,
    correct: new Set([key.get(row.id) ?? ""]),
  }));
  const selections = responses.map((r) => byRow(r.rows, (row) => [row.columnId]));
  return grid(item, {
    selection: "single",
    columns: item.content.columns.map(({ id, label }) => ({ id, label })),
    unreadable,
    defs,
    selections,
  });
}

export function matrixMultipleResponseDistribution(
  item: ItemOf<"matrix_multiple_response">,
  raws: readonly unknown[],
): GridDistribution {
  const rowIds = idSet(item.content.rows);
  const columnIds = idSet(item.content.columns);
  const { responses, unreadable } = readResponses(item.type, raws, (r) => {
    const rows = r.rows.map((row) => row.rowId);
    return (
      noRepeats(rows) &&
      allKnown(rows, rowIds) &&
      r.rows.every((row) => allKnown(row.columnIds, columnIds))
    );
  });
  const key = new Map(item.answerKey.rows.map((row) => [row.rowId, row.correctColumnIds]));
  const defs = item.content.rows.map((row) => ({
    ...row,
    cells: item.content.columns,
    correct: new Set(key.get(row.id) ?? []),
  }));
  const selections = responses.map((r) => byRow(r.rows, (row) => row.columnIds));
  return grid(item, {
    selection: "multiple",
    columns: item.content.columns.map(({ id, label }) => ({ id, label })),
    unreadable,
    defs,
    selections,
  });
}

export function groupingDistribution(
  item: ItemOf<"multiple_response_grouping">,
  raws: readonly unknown[],
): GridDistribution {
  const optionsByRow = new Map(item.content.rows.map((row) => [row.id, idSet(row.options)]));
  const { responses, unreadable } = readResponses(
    item.type,
    raws,
    (r) =>
      noRepeats(r.rows.map((row) => row.rowId)) &&
      r.rows.every((row) => {
        const options = optionsByRow.get(row.rowId);
        return options !== undefined && allKnown(row.optionIds, options);
      }),
  );
  const key = new Map(item.answerKey.rows.map((row) => [row.rowId, row.correctOptionIds]));
  const defs = item.content.rows.map((row) => ({
    id: row.id,
    label: row.label,
    cells: row.options,
    correct: new Set(key.get(row.id) ?? []),
  }));
  const selections = responses.map((r) => byRow(r.rows, (row) => row.optionIds));
  return grid(item, { selection: "multiple", columns: null, unreadable, defs, selections });
}

/** The selectable spans in some tokens, labelled by their text. */
const spansOf = (tokens: readonly HighlightToken[]) =>
  tokens.flatMap((token) =>
    token.kind === "span" ? [{ id: token.spanId, label: token.value }] : [],
  );

export function highlightTextDistribution(
  item: ItemOf<"highlight_text">,
  raws: readonly unknown[],
): GridDistribution {
  const spans = spansOf(item.content.passage);
  const known = idSet(spans);
  const { responses, unreadable } = readResponses(item.type, raws, (r) =>
    allKnown(r.spanIds, known),
  );
  const defs = [
    {
      id: "passage",
      label: "Passage",
      cells: spans,
      correct: new Set(item.answerKey.correctSpanIds),
    },
  ];
  const selections = responses.map((r) => new Map([["passage", r.spanIds]]));
  return grid(item, { selection: "multiple", columns: null, unreadable, defs, selections });
}

/** A table row's label: the text of its first cell, or its id when that cell is empty. */
function rowLabel(row: ItemOf<"highlight_table">["content"]["rows"][number]): string {
  const text = (row.cells[0] ?? [])
    .map((token) => token.value)
    .join("")
    .trim();
  return text === "" ? row.id : text;
}

export function highlightTableDistribution(
  item: ItemOf<"highlight_table">,
  raws: readonly unknown[],
): GridDistribution {
  const correct = new Set(item.answerKey.correctSpanIds);
  const defs = item.content.rows.map((row) => ({
    id: row.id,
    label: rowLabel(row),
    cells: row.cells.flatMap(spansOf),
    correct,
  }));
  const rowOfSpan = new Map(defs.flatMap((def) => def.cells.map((cell) => [cell.id, def.id])));
  const { responses, unreadable } = readResponses(item.type, raws, (r) =>
    r.spanIds.every((id) => rowOfSpan.has(id)),
  );
  const selections = responses.map(
    (r) =>
      new Map(defs.map((def) => [def.id, r.spanIds.filter((id) => rowOfSpan.get(id) === def.id)])),
  );
  return grid(item, { selection: "multiple", columns: null, unreadable, defs, selections });
}
