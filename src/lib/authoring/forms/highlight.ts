import { recordFormOf, recordInputOf, storedRecordFormOf, type EhrFormValues } from "./ehr";
import {
  highlightTableItemSchema,
  highlightTextItemSchema,
  type HighlightToken,
  type ItemInputOf,
  type ItemOf,
  type RichText,
} from "@/lib/ngn/schemas";
import {
  isRecord,
  markdownText,
  storedId,
  storedRecordsWithId,
  storedString,
  storedStrings,
  storedVersion,
} from "./storedValues";

type HighlightTextItem = ItemOf<"highlight_text">;
type HighlightTableItem = ItemOf<"highlight_table">;
type HighlightItem = HighlightTextItem | HighlightTableItem;

/** Fields both highlight forms share with every item. */
interface HighlightFormBase {
  id: string;
  version: number;
  tags: string[];
  cjmmStep?: HighlightItem["cjmmStep"];
  difficulty?: HighlightItem["difficulty"];
  ehr?: EhrFormValues;
  meta: HighlightItem["meta"];
  stem: string;
  instructions: string;
  /** Ids of the spans marked correct. */
  correctSpanIds: string[];
  /** Why each span is right or wrong, keyed by span id; blank means none. */
  spanRationales: Record<string, string>;
  rationaleGeneral: string;
}

export interface HighlightTextFormValues extends HighlightFormBase {
  /** The passage as the author edits it, with each selectable span written as [[phrase|id]]. */
  passage: string;
}

export interface HighlightTableFormValues extends HighlightFormBase {
  columns: { label: string }[];
  /** Each cell uses the same [[phrase|id]] markup as a passage. */
  rows: { id: string; cells: { text: string }[] }[];
  scorePerRow: boolean;
}

export interface MarkedSpan {
  id: string;
  phrase: string;
}

// A phrase is any run without brackets or a bar; only a well-formed id makes a span.
const MARKUP = /\[\[([^[\]|]{1,2000})\|([A-Za-z0-9_-]{1,64})\]\]/g;

const markdown = (value: string): RichText => ({ kind: "markdown", value });
const blank = (value: string) => value.trim().length === 0;

export function tokensToPassage(tokens: readonly HighlightToken[]): string {
  return tokens
    .map((token) => (token.kind === "text" ? token.value : `[[${token.value}|${token.spanId}]]`))
    .join("");
}

/** Splits marked text into text and span tokens, never producing an empty text token. */
export function passageToTokens(text: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKUP)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ kind: "text", value: text.slice(last, index) });
    tokens.push({ kind: "span", spanId: match[2], value: match[1] });
    last = index + match[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", value: text.slice(last) });
  return tokens;
}

/** The spans in marked text, in reading order. */
export function spansInText(text: string): MarkedSpan[] {
  return [...text.matchAll(MARKUP)].map((match) => ({ id: match[2], phrase: match[1] }));
}

export function spansInTable(values: Pick<HighlightTableFormValues, "rows">): MarkedSpan[] {
  return values.rows.flatMap((row) => row.cells.flatMap((cell) => spansInText(cell.text)));
}

export function nextSpanId(taken: ReadonlySet<string>): string {
  for (let i = 1; i < 1000; i += 1) {
    if (!taken.has(`span_${i}`)) return `span_${i}`;
  }
  return `span_${Date.now()}`;
}

/**
 * Wraps the selected phrase in span markup with a fresh id. Spaces at either end stay outside the
 * span. Returns null for an empty selection, or one that touches existing markup or brackets.
 */
export function markSpan(
  text: string,
  start: number,
  end: number,
  taken: ReadonlySet<string>,
): { text: string; spanId: string } | null {
  let from = Math.max(0, Math.min(start, end));
  let to = Math.min(text.length, Math.max(start, end));
  while (from < to && /\s/.test(text[from])) from += 1;
  while (to > from && /\s/.test(text[to - 1])) to -= 1;
  const phrase = text.slice(from, to);
  if (phrase.length === 0 || /[[\]|]/.test(phrase)) return null;
  for (const match of text.matchAll(MARKUP)) {
    const markStart = match.index ?? 0;
    const markEnd = markStart + match[0].length;
    if (from < markEnd && to > markStart) return null;
  }
  const spanId = nextSpanId(taken);
  return { text: `${text.slice(0, from)}[[${phrase}|${spanId}]]${text.slice(to)}`, spanId };
}

/** Turns one span back into its plain phrase, leaving every other span as it was. */
export function unmarkSpan(text: string, spanId: string): string {
  return text.replace(MARKUP, (whole, phrase: string, id: string) =>
    id === spanId ? phrase : whole,
  );
}

/** Answers limited to the spans still present, so a removed span leaves nothing behind. */
export function pruneAnswers(
  answers: Pick<HighlightFormBase, "correctSpanIds" | "spanRationales">,
  present: ReadonlySet<string>,
): Pick<HighlightFormBase, "correctSpanIds" | "spanRationales"> {
  return {
    correctSpanIds: answers.correctSpanIds.filter((id) => present.has(id)),
    spanRationales: Object.fromEntries(
      Object.entries(answers.spanRationales).filter(([id]) => present.has(id)),
    ),
  };
}

/** Every id a new span must avoid: present spans, and any answer an old span left behind. */
export function takenSpanIds(
  spans: readonly MarkedSpan[],
  answers: Pick<HighlightFormBase, "correctSpanIds" | "spanRationales">,
): Set<string> {
  return new Set([
    ...spans.map((span) => span.id),
    ...answers.correctSpanIds,
    ...Object.keys(answers.spanRationales),
  ]);
}

/** The spec's authoring warning: most phrases in a highlight item should be distractors. */
export function highlightWarning(spanCount: number, correctCount: number): string | undefined {
  if (spanCount < 2 || correctCount <= spanCount * 0.6) return undefined;
  return `${correctCount} of ${spanCount} phrases are marked correct. Items work best when most phrases are not.`;
}

function baseForm(item: HighlightItem): HighlightFormBase {
  const perElement = item.rationale.perElement ?? {};
  return {
    id: item.id,
    version: item.version,
    tags: [...item.tags],
    cjmmStep: item.cjmmStep,
    difficulty: item.difficulty,
    ...recordFormOf(item.ehr),
    meta: { ...item.meta },
    stem: item.stem.value,
    instructions: item.instructions ?? "",
    correctSpanIds: [...item.answerKey.correctSpanIds],
    spanRationales: Object.fromEntries(
      Object.entries(perElement).map(([id, text]) => [id, text.value]),
    ),
    rationaleGeneral: item.rationale.general?.value ?? "",
  };
}

export function toHighlightTextForm(item: HighlightTextItem): HighlightTextFormValues {
  return { ...baseForm(item), passage: tokensToPassage(item.content.passage) };
}

export function toHighlightTableForm(item: HighlightTableItem): HighlightTableFormValues {
  return {
    ...baseForm(item),
    columns: item.content.columns.map((label) => ({ label })),
    rows: item.content.rows.map((row) => ({
      id: row.id,
      cells: row.cells.map((cell) => ({ text: tokensToPassage(cell) })),
    })),
    scorePerRow: item.content.scorePerRow,
  };
}

/** Everything but type and content, with answers and rationale limited to spans that exist. */
function envelope(values: HighlightFormBase, spans: readonly MarkedSpan[]) {
  const present = new Set(spans.map((span) => span.id));
  const correctSpanIds = values.correctSpanIds.filter((id) => present.has(id));
  const perElement = Object.fromEntries(
    Object.entries(values.spanRationales)
      .filter(([id, text]) => present.has(id) && !blank(text))
      .map(([id, text]) => [id, markdown(text)]),
  );
  return {
    id: values.id,
    version: values.version,
    tags: [...values.tags],
    ...(values.cjmmStep !== undefined ? { cjmmStep: values.cjmmStep } : {}),
    ...(values.difficulty !== undefined ? { difficulty: values.difficulty } : {}),
    ...recordInputOf(values.ehr),
    stem: markdown(values.stem),
    ...(blank(values.instructions) ? {} : { instructions: values.instructions }),
    answerKey: { correctSpanIds },
    // Plus/minus: each correct span is worth a point, whether scored whole or per row.
    scoring: { model: "plus_minus" as const, maxPoints: Math.max(1, correctSpanIds.length) },
    rationale: {
      ...(blank(values.rationaleGeneral) ? {} : { general: markdown(values.rationaleGeneral) }),
      ...(Object.keys(perElement).length > 0 ? { perElement } : {}),
    },
    meta: { ...values.meta },
  };
}

export function fromHighlightTextForm(
  values: HighlightTextFormValues,
): ItemInputOf<"highlight_text"> {
  return {
    ...envelope(values, spansInText(values.passage)),
    type: "highlight_text",
    content: { passage: passageToTokens(values.passage) },
  };
}

export function fromHighlightTableForm(
  values: HighlightTableFormValues,
): ItemInputOf<"highlight_table"> {
  return {
    ...envelope(values, spansInTable(values)),
    type: "highlight_table",
    content: {
      columns: values.columns.map((column) => column.label),
      rows: values.rows.map((row) => ({
        id: row.id,
        cells: row.cells.map((cell) => passageToTokens(cell.text)),
      })),
      scorePerRow: values.scorePerRow,
    },
  };
}

function emptyBase(id: string): HighlightFormBase {
  return {
    id,
    version: 1,
    tags: [],
    meta: {},
    stem: "",
    instructions: "",
    correctSpanIds: [],
    spanRationales: {},
    rationaleGeneral: "",
  };
}

/** A new passage with nothing marked. Invalid until spans are marked. */
export function emptyHighlightTextForm(id: string): HighlightTextFormValues {
  return { ...emptyBase(id), passage: "" };
}

/** Two columns and two rows of empty cells. Invalid until filled in. */
export function emptyHighlightTableForm(id: string): HighlightTableFormValues {
  return {
    ...emptyBase(id),
    columns: [{ label: "" }, { label: "" }],
    rows: [1, 2].map((n) => ({ id: `row_${n}`, cells: [{ text: "" }, { text: "" }] })),
    scorePerRow: false,
  };
}

// The table schema's maximums: 4 columns, 8 rows.
const MAX_COLUMNS = 4;
const MAX_ROWS = 8;

/** Well-formed tokens only: text with a string value, spans with a string id and value. */
function storedTokens(value: unknown): HighlightToken[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((token): HighlightToken[] => {
    if (token.kind === "text" && typeof token.value === "string") {
      return [{ kind: "text", value: token.value }];
    }
    if (
      token.kind === "span" &&
      typeof token.spanId === "string" &&
      typeof token.value === "string"
    ) {
      return [{ kind: "span", spanId: token.spanId, value: token.value }];
    }
    return [];
  });
}

/** The well-formed parts every stored highlight draft shares. */
function storedBase(stored: Record<string, unknown>, rowId: string): HighlightFormBase {
  const answerKey = isRecord(stored.answerKey) ? stored.answerKey : {};
  const rationale = isRecord(stored.rationale) ? stored.rationale : {};
  const perElement = isRecord(rationale.perElement) ? rationale.perElement : {};
  return {
    ...emptyBase(storedId(stored.id, rowId)),
    version: storedVersion(stored.version),
    ...storedRecordFormOf(stored),
    tags: storedStrings(stored.tags),
    stem: markdownText(stored.stem),
    instructions: storedString(stored.instructions),
    correctSpanIds: storedStrings(answerKey.correctSpanIds),
    spanRationales: Object.fromEntries(
      Object.entries(perElement).map(([id, text]) => [id, markdownText(text)]),
    ),
    rationaleGeneral: markdownText(rationale.general),
  };
}

/** Opens whatever is stored for a highlight text item. Never throws. */
export function highlightTextFormFromStored(
  stored: unknown,
  rowId: string,
): HighlightTextFormValues {
  const item = highlightTextItemSchema.safeParse(stored);
  if (item.success) return toHighlightTextForm(item.data);
  if (!isRecord(stored)) return emptyHighlightTextForm(rowId);
  const content = isRecord(stored.content) ? stored.content : {};
  return {
    ...storedBase(stored, rowId),
    passage: tokensToPassage(storedTokens(content.passage)),
  };
}

/** Opens whatever is stored for a highlight table item. Never throws. */
export function highlightTableFormFromStored(
  stored: unknown,
  rowId: string,
): HighlightTableFormValues {
  const item = highlightTableItemSchema.safeParse(stored);
  if (item.success) return toHighlightTableForm(item.data);
  const blankForm = emptyHighlightTableForm(rowId);
  if (!isRecord(stored)) return blankForm;
  const content = isRecord(stored.content) ? stored.content : {};
  const columns = storedStrings(content.columns)
    .slice(0, MAX_COLUMNS)
    .map((label) => ({ label }));
  const rows = storedRecordsWithId(content.rows, MAX_ROWS).map((row) => ({
    id: row.id,
    cells: (Array.isArray(row.cells) ? row.cells : [])
      .slice(0, MAX_COLUMNS)
      .map((cell) => ({ text: tokensToPassage(storedTokens(cell)) })),
  }));
  return {
    ...storedBase(stored, rowId),
    columns: columns.length > 0 ? columns : blankForm.columns,
    rows: rows.length > 0 ? rows : blankForm.rows,
    scorePerRow: content.scorePerRow === true,
  };
}
