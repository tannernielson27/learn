import { normalizeLine } from "@/lib/ngn/draft";
import type { ItemInput, ItemInputOf, ItemType } from "@/lib/ngn/schemas";

/**
 * What an item says, without the ids the converter chose (#339). Two items with the same
 * signature ask the same question with the same words and the same key, so the eval compares
 * signatures, never ids or token positions.
 */
export interface ItemSignature {
  type: ItemType;
  stem: string;
  /** Every piece of text a student reads or picks from, in the order the item shows it. */
  options: string[];
  /** The key as text: the keyed choices, or `row → column` pairs, in a fixed order. Empty for no key. */
  key: string[];
}

type Labeled = { id: string; label: string };
type Token = { kind: "text"; value: string } | { kind: "blank"; blankId: string };
type Highlight = { kind: "text"; value: string } | { kind: "span"; spanId: string; value: string };

/** Text as the eval compares it: one line, quotes straightened, case kept. */
export const comparable = (text: string): string => normalizeLine(text);

const labelOf = (list: readonly Labeled[], id: string | undefined): string =>
  comparable(list.find((entry) => entry.id === id)?.label ?? `(no such choice: ${id})`);

const labels = (list: readonly Labeled[]): string[] => list.map((entry) => comparable(entry.label));

const sorted = (values: string[]): string[] => [...values].sort();

/** A cloze sentence with each blank shown as its position, so the text compares without ids. */
function sentenceOf(tokens: readonly Token[]): { text: string; blanks: string[] } {
  const blanks: string[] = [];
  const text = tokens
    .map((token) => {
      if (token.kind === "text") return token.value;
      blanks.push(token.blankId);
      return `[${blanks.length}]`;
    })
    .join("");
  return { text: comparable(text), blanks };
}

function passageOf(tokens: readonly Highlight[]): { text: string; spans: Map<string, string> } {
  const spans = new Map<string, string>();
  const text = tokens
    .map((token) => {
      if (token.kind === "text") return token.value;
      spans.set(token.spanId, comparable(token.value));
      return `[${token.value}]`;
    })
    .join("");
  return { text: comparable(text), spans };
}

type Parts = Pick<ItemSignature, "options" | "key">;

const PARTS: { [T in ItemType]: (item: ItemInputOf<T>) => Parts } = {
  multiple_choice: ({ content, answerKey }) => ({
    options: labels(content.options),
    key: answerKey.correctOptionId ? [labelOf(content.options, answerKey.correctOptionId)] : [],
  }),
  multiple_response: ({ content, answerKey }) => ({
    options: [
      ...labels(content.options),
      content.variant === "select_n" ? `select ${content.n}` : "select all",
    ],
    key: sorted(answerKey.correctOptionIds.map((id) => labelOf(content.options, id))),
  }),
  multiple_response_grouping: ({ content, answerKey }) => ({
    options: content.rows.flatMap((row) => [
      comparable(row.label),
      ...labels(row.options).map((label) => `${comparable(row.label)}: ${label}`),
    ]),
    key: sorted(
      answerKey.rows.flatMap(({ rowId, correctOptionIds }) => {
        const row = content.rows.find((entry) => entry.id === rowId);
        return correctOptionIds.map(
          (id) => `${comparable(row?.label ?? rowId)}: ${labelOf(row?.options ?? [], id)}`,
        );
      }),
    ),
  }),
  matrix_multiple_choice: ({ content, answerKey }) => ({
    options: [...labels(content.columns), ...labels(content.rows)],
    key: sorted(
      answerKey.rows.map(
        (row) =>
          `${labelOf(content.rows, row.rowId)} → ${labelOf(content.columns, row.correctColumnId)}`,
      ),
    ),
  }),
  matrix_multiple_response: ({ content, answerKey }) => ({
    options: [...labels(content.columns), ...labels(content.rows)],
    key: sorted(
      answerKey.rows.flatMap((row) =>
        row.correctColumnIds.map(
          (id) => `${labelOf(content.rows, row.rowId)} → ${labelOf(content.columns, id)}`,
        ),
      ),
    ),
  }),
  dropdown_cloze: (item) => dropdownParts(item),
  dropdown_rationale: (item) => dropdownParts(item),
  dropdown_table: ({ content, answerKey }) => ({
    options: [
      comparable(content.columns.label),
      comparable(content.columns.dropdown),
      ...content.rows.flatMap((row) => [
        comparable(row.label),
        ...labels(row.choices).map((label) => `${comparable(row.label)}: ${label}`),
      ]),
    ],
    key: sorted(
      answerKey.rows.map(({ rowId, correctChoiceId }) => {
        const row = content.rows.find((entry) => entry.id === rowId);
        return `${comparable(row?.label ?? rowId)} → ${labelOf(row?.choices ?? [], correctChoiceId)}`;
      }),
    ),
  }),
  highlight_text: ({ content, answerKey }) => {
    const { text, spans } = passageOf(content.passage);
    return {
      options: [text, ...spans.values()],
      key: sorted(answerKey.correctSpanIds.map((id) => spans.get(id) ?? `(no such span: ${id})`)),
    };
  },
  highlight_table: ({ content, answerKey }) => {
    const spans = new Map<string, string>();
    const cells = content.rows.flatMap((row) =>
      row.cells.map((cell) => {
        const passage = passageOf(cell);
        passage.spans.forEach((value, id) => spans.set(id, value));
        return passage.text;
      }),
    );
    return {
      options: [...content.columns.map(comparable), ...cells],
      key: sorted(answerKey.correctSpanIds.map((id) => spans.get(id) ?? `(no such span: ${id})`)),
    };
  },
  dragdrop_cloze: (item) => dragdropParts(item),
  dragdrop_rationale: (item) => dragdropParts(item),
  ordered_response: ({ content, answerKey }) => ({
    options: labels(content.items),
    key: answerKey.orderedIds.map((id) => labelOf(content.items, id)),
  }),
  bowtie: ({ content, answerKey }) => ({
    options: [
      ...labels(content.actions).map((label) => `action: ${label}`),
      ...labels(content.conditions).map((label) => `condition: ${label}`),
      ...labels(content.parameters).map((label) => `parameter: ${label}`),
    ],
    key: [
      ...sorted(answerKey.actionIds.map((id) => `action: ${labelOf(content.actions, id)}`)),
      ...(answerKey.conditionId
        ? [`condition: ${labelOf(content.conditions, answerKey.conditionId)}`]
        : []),
      ...sorted(
        answerKey.parameterIds.map((id) => `parameter: ${labelOf(content.parameters, id)}`),
      ),
    ],
  }),
};

function dropdownParts(item: ItemInputOf<"dropdown_cloze" | "dropdown_rationale">): Parts {
  const { text, blanks } = sentenceOf(item.content.tokens);
  const choicesOf = (blankId: string) =>
    item.content.blanks.find((blank) => blank.id === blankId)?.choices ?? [];
  return {
    options: [
      text,
      ...blanks.flatMap((id, index) =>
        labels(choicesOf(id)).map((label) => `[${index + 1}]: ${label}`),
      ),
    ],
    key: item.answerKey.blanks
      .map(({ blankId, correctChoiceId }) => {
        const position = blanks.indexOf(blankId) + 1;
        return `[${position}] → ${labelOf(choicesOf(blankId), correctChoiceId)}`;
      })
      .sort(),
  };
}

function dragdropParts(item: ItemInputOf<"dragdrop_cloze" | "dragdrop_rationale">): Parts {
  const { text, blanks } = sentenceOf(item.content.tokens);
  return {
    options: [text, ...labels(item.content.bank).map((label) => `bank: ${label}`)],
    key: item.answerKey.blanks
      .map(({ blankId, correctTokenId }) => {
        const position = blanks.indexOf(blankId) + 1;
        return `[${position}] → ${labelOf(item.content.bank, correctTokenId)}`;
      })
      .sort(),
  };
}

/** The signature of an item, valid or not: a converted draft with no key gives an empty key. */
export function signatureOf(item: ItemInput): ItemSignature {
  const parts = (PARTS[item.type] as (item: ItemInput) => Parts)(item);
  return { type: item.type, stem: comparable(item.stem.value), ...parts };
}
