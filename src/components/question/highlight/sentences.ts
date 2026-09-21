import type { HighlightToken } from "./HighlightTokens";

// A full stop, question or exclamation mark that ends a sentence: followed by space or the end of
// the text, so "37.2 °C" and "2/10" are not split.
const SENTENCE_END = /[.!?](?=\s|$)/g;

/**
 * A passage cut into sentences. Only plain text ends a sentence; a highlightable span never does,
 * so a span always stays inside the sentence around it. The space after a full stop opens the
 * next sentence, where the start of a block collapses it.
 */
export function sentencesOf(tokens: readonly HighlightToken[]): HighlightToken[][] {
  const sentences: HighlightToken[][] = [];
  let current: HighlightToken[] = [];
  for (const token of tokens) {
    if (token.kind === "span") {
      current.push(token);
      continue;
    }
    let start = 0;
    for (const match of token.value.matchAll(SENTENCE_END)) {
      const end = match.index + 1;
      current.push({ kind: "text", value: token.value.slice(start, end) });
      sentences.push(current);
      current = [];
      start = end;
    }
    if (start < token.value.length) current.push({ kind: "text", value: token.value.slice(start) });
  }
  if (current.length > 0) sentences.push(current);
  return sentences;
}

export interface ExplainedRun {
  tokens: HighlightToken[];
  /** The explained spans in the run, in reading order; all of them sit in its last sentence. */
  spans: { spanId: string; value: string }[];
}

/**
 * The passage in runs that each end with a sentence holding an explained span, so an explanation
 * can follow the sentence it is about while the sentences between stay one paragraph. The last
 * run may explain nothing.
 */
export function explainedRuns(
  tokens: readonly HighlightToken[],
  isExplained: (spanId: string) => boolean,
): ExplainedRun[] {
  const runs: ExplainedRun[] = [];
  let pending: HighlightToken[] = [];
  for (const sentence of sentencesOf(tokens)) {
    pending.push(...sentence);
    const spans = sentence.flatMap((t) =>
      t.kind === "span" && isExplained(t.spanId) ? [{ spanId: t.spanId, value: t.value }] : [],
    );
    if (spans.length === 0) continue;
    runs.push({ tokens: pending, spans });
    pending = [];
  }
  if (pending.length > 0) runs.push({ tokens: pending, spans: [] });
  return runs;
}
