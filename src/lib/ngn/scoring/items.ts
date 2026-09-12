import type { ItemOf, ItemType, ResponseOf } from "../schemas";
import { spanIdsOf } from "../schemas/structured";
import type { ScoreResult } from "../types";
import { scorePlusMinus, scoreRationale, scoreZeroOne, sumResults } from "./models";

type Scorer<T extends ItemType> = (item: ItemOf<T>, response: ResponseOf<T>) => ScoreResult;

const labelsOf = (list: readonly { id: string; label: string }[]): Record<string, string> =>
  Object.fromEntries(list.map((x) => [x.id, x.label]));

// --- selection family --------------------------------------------------------

const multipleChoice: Scorer<"multiple_choice"> = (item, response) => {
  const labels = labelsOf(item.content.options);
  const id = item.answerKey.correctOptionId;
  return scoreZeroOne([{ id, label: labels[id], correct: response.optionId === id }]);
};

const multipleResponse: Scorer<"multiple_response"> = (item, response) =>
  scorePlusMinus({
    selected: response.optionIds,
    correct: item.answerKey.correctOptionIds,
    labels: labelsOf(item.content.options),
  });

const multipleResponseGrouping: Scorer<"multiple_response_grouping"> = (item, response) =>
  sumResults(
    "plus_minus",
    item.answerKey.rows.map((keyRow) => {
      const row = item.content.rows.find((r) => r.id === keyRow.rowId);
      const answered = response.rows.find((r) => r.rowId === keyRow.rowId);
      return scorePlusMinus({
        selected: answered?.optionIds ?? [],
        correct: keyRow.correctOptionIds,
        labels: row ? labelsOf(row.options) : {},
      });
    }),
  );

const matrixMultipleChoice: Scorer<"matrix_multiple_choice"> = (item, response) => {
  const rowLabels = labelsOf(item.content.rows);
  return scoreZeroOne(
    item.answerKey.rows.map((keyRow) => {
      const answered = response.rows.find((r) => r.rowId === keyRow.rowId);
      return {
        id: keyRow.rowId,
        label: rowLabels[keyRow.rowId],
        correct: answered?.columnId === keyRow.correctColumnId,
      };
    }),
  );
};

const matrixMultipleResponse: Scorer<"matrix_multiple_response"> = (item, response) => {
  const colLabels = labelsOf(item.content.columns);
  const rowLabels = labelsOf(item.content.rows);
  return sumResults(
    "plus_minus",
    item.answerKey.rows.map((keyRow) => {
      const answered = response.rows.find((r) => r.rowId === keyRow.rowId);
      const result = scorePlusMinus({
        selected: answered?.columnIds ?? [],
        correct: keyRow.correctColumnIds,
        labels: colLabels,
      });
      // Namespace column ids by row so breakdown entries stay unique across rows, and name the row
      // in the label: a column alone ("Pulmonary embolism") repeats once per row.
      const rowLabel = rowLabels[keyRow.rowId];
      return {
        ...result,
        breakdown: result.breakdown.map((b) => ({
          ...b,
          elementId: `${keyRow.rowId}:${b.elementId}`,
          label: rowLabel && b.label ? `${rowLabel}: ${b.label}` : b.label,
        })),
      };
    }),
  );
};

// --- cloze family ------------------------------------------------------------

type BlankKey = { blankId: string; correctChoiceId?: string; correctTokenId?: string };
type BlankResponse = { blankId: string; choiceId?: string; tokenId?: string };

const blankCorrectness = (keys: readonly BlankKey[], responses: readonly BlankResponse[]) =>
  keys.map((k, index) => {
    const answered = responses.find((r) => r.blankId === k.blankId);
    const expected = k.correctChoiceId ?? k.correctTokenId;
    const actual = answered?.choiceId ?? answered?.tokenId;
    return {
      id: k.blankId,
      blankId: k.blankId,
      // What the sentence calls it. Without this the breakdown names blanks by their ids.
      label: `Blank ${index + 1}`,
      correct: actual !== undefined && actual === expected,
    };
  });

const clozeZeroOne = (keys: readonly BlankKey[], responses: readonly BlankResponse[]) =>
  scoreZeroOne(blankCorrectness(keys, responses));

const clozeRationale = (
  keys: readonly BlankKey[],
  responses: readonly BlankResponse[],
  anchor?: string,
) => scoreRationale(blankCorrectness(keys, responses), anchor);

const dropdownCloze: Scorer<"dropdown_cloze"> = (item, response) =>
  clozeZeroOne(item.answerKey.blanks, response.blanks);

const dropdownRationale: Scorer<"dropdown_rationale"> = (item, response) =>
  clozeRationale(item.answerKey.blanks, response.blanks, item.answerKey.anchorBlankId);

const dropdownTable: Scorer<"dropdown_table"> = (item, response) => {
  const rowLabels = Object.fromEntries(item.content.rows.map((r) => [r.id, r.label]));
  return scoreZeroOne(
    item.answerKey.rows.map((keyRow) => {
      const answered = response.rows.find((r) => r.rowId === keyRow.rowId);
      return {
        id: keyRow.rowId,
        label: rowLabels[keyRow.rowId],
        correct: answered?.choiceId === keyRow.correctChoiceId,
      };
    }),
  );
};

const dragdropCloze: Scorer<"dragdrop_cloze"> = (item, response) =>
  clozeZeroOne(item.answerKey.blanks, response.blanks);

const dragdropRationale: Scorer<"dragdrop_rationale"> = (item, response) =>
  clozeRationale(item.answerKey.blanks, response.blanks, item.answerKey.anchorBlankId);

// --- highlight ---------------------------------------------------------------

const highlightText: Scorer<"highlight_text"> = (item, response) => {
  const labels = Object.fromEntries(
    item.content.passage.flatMap((t) => (t.kind === "span" ? [[t.spanId, t.value]] : [])),
  );
  return scorePlusMinus({
    selected: response.spanIds,
    correct: item.answerKey.correctSpanIds,
    labels,
  });
};

const highlightTable: Scorer<"highlight_table"> = (item, response) => {
  const labels = Object.fromEntries(
    item.content.rows.flatMap((r) =>
      r.cells.flatMap((c) => c.flatMap((t) => (t.kind === "span" ? [[t.spanId, t.value]] : []))),
    ),
  );
  if (!item.content.scorePerRow) {
    return scorePlusMinus({
      selected: response.spanIds,
      correct: item.answerKey.correctSpanIds,
      labels,
    });
  }
  const selected = new Set(response.spanIds);
  const correct = new Set(item.answerKey.correctSpanIds);
  return sumResults(
    "plus_minus",
    item.content.rows.map((row) => {
      const rowSpans = row.cells.flatMap((c) => spanIdsOf(c));
      return scorePlusMinus({
        selected: rowSpans.filter((id) => selected.has(id)),
        correct: rowSpans.filter((id) => correct.has(id)),
        labels,
      });
    }),
  );
};

// --- ordered / bowtie --------------------------------------------------------

const orderedResponse: Scorer<"ordered_response"> = (item, response) => {
  const labels = labelsOf(item.content.items);
  const key = item.answerKey.orderedIds;
  if (item.content.partial === "position") {
    return scoreZeroOne(
      key.map((id, index) => ({
        id: `pos_${index + 1}`,
        label: labels[id],
        correct: response.orderedIds[index] === id,
      })),
    );
  }
  const exact =
    key.length === response.orderedIds.length &&
    key.every((id, index) => response.orderedIds[index] === id);
  return scoreZeroOne([{ id: "order", label: "Correct order", correct: exact }]);
};

const bowtie: Scorer<"bowtie"> = (item, response) => {
  const actionLabels = labelsOf(item.content.actions);
  const conditionLabels = labelsOf(item.content.conditions);
  const parameterLabels = labelsOf(item.content.parameters);
  const pairSlots = (
    prefix: string,
    correct: readonly string[],
    given: readonly string[],
    labels: Record<string, string>,
  ) => {
    const givenSet = new Set(given);
    return correct.map((id, index) => ({
      id: `${prefix}_${index + 1}`,
      label: labels[id],
      correct: givenSet.has(id),
    }));
  };
  return scoreZeroOne([
    ...pairSlots("action", item.answerKey.actionIds, response.actionIds, actionLabels),
    {
      id: "condition",
      label: conditionLabels[item.answerKey.conditionId],
      correct: response.conditionId === item.answerKey.conditionId,
    },
    ...pairSlots("parameter", item.answerKey.parameterIds, response.parameterIds, parameterLabels),
  ]);
};

export const SCORERS: { [T in ItemType]: Scorer<T> } = {
  multiple_choice: multipleChoice,
  multiple_response: multipleResponse,
  multiple_response_grouping: multipleResponseGrouping,
  matrix_multiple_choice: matrixMultipleChoice,
  matrix_multiple_response: matrixMultipleResponse,
  dropdown_cloze: dropdownCloze,
  dropdown_rationale: dropdownRationale,
  dropdown_table: dropdownTable,
  highlight_text: highlightText,
  highlight_table: highlightTable,
  dragdrop_cloze: dragdropCloze,
  dragdrop_rationale: dragdropRationale,
  ordered_response: orderedResponse,
  bowtie: bowtie,
};
