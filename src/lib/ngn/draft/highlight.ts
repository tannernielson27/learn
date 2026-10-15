import { z } from "zod";
import type { HighlightToken, ItemOf, RichText } from "../schemas";
import {
  draftEnvelopeFields,
  envelopeDraftOf,
  envelopeOf,
  needsAnswer,
  needsFix,
  numberedId,
  optionalMarkdown,
  resolveScoring,
  STATED_RULE_TEXT,
  type DraftContext,
  type DraftConversion,
  type DraftReason,
} from "./common";
import { onlyMarkers, readMarkers, unreadableMessage } from "./markers";
import { normalizeLine, readMarked } from "./text";

/**
 * Highlight drafts (#338). The passage, or each table cell, is copied word for word with every
 * highlightable phrase written as [[span: phrase]]; the converter builds the tokens and span ids.
 */

const SPAN_HOWTO =
  "Write every phrase a student may highlight as [[span: phrase]], exactly where it falls, and keep the source's * or check mark on a keyed phrase, as in [[span: heart rate 118*]]. Highlighting, bold or a check mark in the source is the key; never add a mark the source does not have.";

const phraseAnswerField = z
  .string()
  .optional()
  .describe(
    "The keyed phrases when the source prints them apart from the passage, one phrase per line, word for word. Leave it out when the phrases carry their own marks or the source has no key. Never work out an answer yourself.",
  );

const phraseRationalesField = z
  .array(
    z.object({
      phrase: z.string().describe("The phrase, exactly as written inside its [[span: ]]."),
      rationale: z.string().describe("What the source says about it, word for word."),
    }),
  )
  .optional()
  .describe(
    "Rationales the source gives for single phrases. Leave it out when it gives none. Never write one yourself.",
  );

export const highlightTextDraftSchema = z.object({
  type: z.literal("highlight_text"),
  ...draftEnvelopeFields,
  passage: z.string().describe(`The passage, word for word. ${SPAN_HOWTO}`),
  answer: phraseAnswerField,
  rationales: phraseRationalesField,
});
export type HighlightTextDraft = z.infer<typeof highlightTextDraftSchema>;

export const highlightTableDraftSchema = z.object({
  type: z.literal("highlight_table"),
  ...draftEnvelopeFields,
  columns: z.array(z.string()).describe("The column headings, word for word, left to right."),
  rows: z
    .array(
      z.object({
        cells: z
          .array(z.string())
          .describe(`The row's cells, left to right, word for word. ${SPAN_HOWTO}`),
      }),
    )
    .describe("Every row, top to bottom."),
  answer: phraseAnswerField,
  rationales: phraseRationalesField,
});
export type HighlightTableDraft = z.infer<typeof highlightTableDraftSchema>;

// ---------------------------------------------------------------------------
// Shared: phrases, keys, rationales
// ---------------------------------------------------------------------------

interface Span {
  id: string;
  text: string;
  marked: boolean;
}

/** Reads prose into highlight tokens, numbering spans on from `spans` (which it extends). */
function readPassage(
  raw: string,
  spans: Span[],
  path: (string | number)[],
): { tokens: HighlightToken[]; reasons: DraftReason[] } {
  const prose = onlyMarkers(readMarkers(raw), "span");
  const reasons: DraftReason[] =
    prose.unreadable.length > 0 ? [needsFix(unreadableMessage(prose.unreadable), path)] : [];
  const tokens = prose.segments.flatMap((segment): HighlightToken[] => {
    if (segment.kind === "text") return [{ kind: "text", value: segment.value }];
    const read = readMarked(segment.inner ?? "");
    if (read.text === "") {
      reasons.push(needsFix("A [[span]] marker holds no phrase.", path));
      return [];
    }
    const span = { id: numberedId("span", spans.length), ...read };
    spans.push(span);
    return [{ kind: "span", spanId: span.id, value: span.text }];
  });
  return { tokens, reasons };
}

const sameText = (a: string, b: string) =>
  normalizeLine(a).toLowerCase() === normalizeLine(b).toLowerCase();

/** The span a phrase names, preferring one not already taken (a passage may repeat a phrase). */
function locate(phrase: string, spans: readonly Span[], taken: ReadonlySet<string>) {
  const text = readMarked(phrase).text.replace(/[.;]+$/, "");
  const matches = spans.filter((span) => sameText(span.text, text));
  return matches.find((span) => !taken.has(span.id)) ?? matches[0];
}

function phraseKeys(
  spans: readonly Span[],
  answer: string | undefined,
): { keys: string[]; reasons: DraftReason[] } {
  const marked = spans.filter((span) => span.marked).map((span) => span.id);
  const lines = (answer ?? "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) {
    return {
      keys: marked,
      reasons:
        marked.length === 0 && spans.length > 0
          ? [
              needsAnswer(
                "The source marks no phrases. Add the key before this question can be imported.",
              ),
            ]
          : [],
    };
  }
  const reasons: DraftReason[] = [];
  const printed = new Set<string>();
  for (const line of lines) {
    const span = locate(line, spans, printed);
    if (span) printed.add(span.id);
    else {
      reasons.push(
        needsFix(`The keyed phrase "${line}" is not one of the passage's [[span]] phrases.`, [
          "answer",
        ]),
      );
    }
  }
  const agrees =
    marked.length === 0 ||
    (marked.length === printed.size && marked.every((id) => printed.has(id)));
  if (!agrees) {
    reasons.push(
      needsFix("The phrases' marks and the key printed in the source disagree.", ["answer"]),
    );
  }
  return { keys: spans.filter((span) => printed.has(span.id)).map((span) => span.id), reasons };
}

function phraseRationales(
  spans: readonly Span[],
  rationales: HighlightTextDraft["rationales"],
): { perElement: Record<string, RichText>; reasons: DraftReason[] } {
  const perElement: Record<string, RichText> = {};
  const reasons: DraftReason[] = [];
  const taken = new Set<string>();
  (rationales ?? []).forEach(({ phrase, rationale }, index) => {
    const text = optionalMarkdown(rationale);
    if (!text) return;
    const span = locate(phrase, spans, taken);
    if (!span) {
      reasons.push(
        needsFix(`The rationale for "${phrase.trim()}" names a phrase the passage does not mark.`, [
          "rationales",
          index,
        ]),
      );
      return;
    }
    taken.add(span.id);
    perElement[span.id] = text;
  });
  return { perElement, reasons };
}

const HIGHLIGHT_SCORING = { default: "plus_minus", allowed: ["plus_minus"] } as const;

/** Everything a highlight item shares once its spans are read. */
function highlightParts(
  draft: HighlightTextDraft | HighlightTableDraft,
  context: DraftContext,
  spans: readonly Span[],
) {
  const keys = phraseKeys(spans, draft.answer);
  const rationales = phraseRationales(spans, draft.rationales);
  const scoring = resolveScoring(draft.statedScoring, HIGHLIGHT_SCORING);
  const noSpans: DraftReason[] =
    spans.length === 0
      ? [needsFix("No phrase is marked as [[span]], so nothing can be highlighted.")]
      : [];
  return {
    envelope: envelopeOf(draft, context, rationales.perElement),
    answerKey: { correctSpanIds: keys.keys },
    scoring: { model: scoring.rule, maxPoints: Math.max(1, keys.keys.length) },
    reasons: [...noSpans, ...keys.reasons, ...rationales.reasons, ...scoring.reasons],
  };
}

// ---------------------------------------------------------------------------
// highlight_text
// ---------------------------------------------------------------------------

export function fromHighlightTextDraft(
  draft: HighlightTextDraft,
  context: DraftContext = {},
): DraftConversion<"highlight_text"> {
  const spans: Span[] = [];
  const passage = readPassage(draft.passage, spans, ["passage"]);
  const parts = highlightParts(draft, context, spans);
  return {
    item: {
      ...parts.envelope,
      type: "highlight_text",
      content: { passage: passage.tokens },
      answerKey: parts.answerKey,
      scoring: parts.scoring,
    },
    reasons: [...passage.reasons, ...parts.reasons],
  };
}

/** Prose with each span written back as a marker, keyed ones carrying a `*`. */
function proseOf(tokens: readonly HighlightToken[], keyed: ReadonlySet<string>): string {
  return tokens
    .map((token) =>
      token.kind === "text"
        ? token.value
        : `[[span: ${token.value}${keyed.has(token.spanId) ? "*" : ""}]]`,
    )
    .join("");
}

function rationalesDraftOf(
  item: ItemOf<"highlight_text" | "highlight_table">,
  tokens: readonly HighlightToken[],
): { rationales?: { phrase: string; rationale: string }[] } {
  const perElement = item.rationale.perElement ?? {};
  const rationales = tokens.flatMap((token) =>
    token.kind === "span" && perElement[token.spanId]
      ? [{ phrase: token.value, rationale: perElement[token.spanId].value }]
      : [],
  );
  return rationales.length > 0 ? { rationales } : {};
}

export function toHighlightTextDraft(item: ItemOf<"highlight_text">): HighlightTextDraft {
  const keyed = new Set(item.answerKey.correctSpanIds);
  return {
    type: "highlight_text",
    ...envelopeDraftOf(item, STATED_RULE_TEXT.plus_minus),
    passage: proseOf(item.content.passage, keyed),
    ...rationalesDraftOf(item, item.content.passage),
  };
}

// ---------------------------------------------------------------------------
// highlight_table
// ---------------------------------------------------------------------------

const PER_ROW = /\b(?:per|each|by)\s+row\b/i;
const PER_ROW_TEXT = `${STATED_RULE_TEXT.plus_minus} per row`;

export function fromHighlightTableDraft(
  draft: HighlightTableDraft,
  context: DraftContext = {},
): DraftConversion<"highlight_table"> {
  const spans: Span[] = [];
  const reasons: DraftReason[] = [];
  const rows = draft.rows.map((row, rowIndex) => ({
    id: numberedId("row", rowIndex),
    cells: row.cells.map((cell, cellIndex) => {
      const read = readPassage(cell, spans, ["rows", rowIndex, "cells", cellIndex]);
      reasons.push(...read.reasons);
      return read.tokens;
    }),
  }));
  const parts = highlightParts(draft, context, spans);
  const scorePerRow = draft.statedScoring !== undefined && PER_ROW.test(draft.statedScoring);
  return {
    item: {
      ...parts.envelope,
      type: "highlight_table",
      content: {
        columns: draft.columns.map(normalizeLine),
        rows,
        ...(scorePerRow ? { scorePerRow: true } : {}),
      },
      answerKey: parts.answerKey,
      scoring: parts.scoring,
    },
    reasons: [...reasons, ...parts.reasons],
  };
}

export function toHighlightTableDraft(item: ItemOf<"highlight_table">): HighlightTableDraft {
  const keyed = new Set(item.answerKey.correctSpanIds);
  const tokens = item.content.rows.flatMap((row) => row.cells.flat());
  return {
    type: "highlight_table",
    ...envelopeDraftOf(item, item.content.scorePerRow ? PER_ROW_TEXT : STATED_RULE_TEXT.plus_minus),
    columns: [...item.content.columns],
    rows: item.content.rows.map((row) => ({
      cells: row.cells.map((cell) => proseOf(cell, keyed)),
    })),
    ...rationalesDraftOf(item, tokens),
  };
}
