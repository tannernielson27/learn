import type { HighlightToken } from "./schemas/structured";

/**
 * Span ids in reading order. Lives outside the schema module so scoring, which runs in the
 * gallery's browser bundle, can use it without importing zod.
 */
export const spanIdsOf = (tokens: readonly HighlightToken[]): string[] =>
  tokens.flatMap((t) => (t.kind === "span" ? [t.spanId] : []));
