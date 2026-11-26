import { PRICE_PER_MILLION } from "@/lib/ai/config";
import { CHARS_PER_TOKEN, MIN_RESERVATION_USD } from "@/lib/ai/ledger";
import { SEGMENT_MAX_TOKENS } from "./config";
import type { ChunkPayload } from "./files/prepare";

/**
 * What an AI import call is reserved at (#342), before the model has read a word. The ledger
 * itself, and the estimate for a call that sends no document, are shared: `src/lib/ai/ledger.ts`.
 */

/** A PDF page sent as a document: its text plus its page image, about 1,500 + 1,600 tokens. */
const TOKENS_PER_PDF_PAGE = 3_200;
/** The rules, the schema and the request around the document. */
const PROMPT_TOKENS = 3_000;

/**
 * What a call is reserved at: the input as if none of it came from the cache, written to it at
 * the higher price, and the whole of `maxTokens` as output. Settling gives the rest back.
 * Computed from the document's size alone, plus `promptChars` of request text around it (the
 * drafts a repair call sends back), before the model has read a word of it.
 */
export function estimateCallCost(
  payload: ChunkPayload,
  pages: number,
  maxTokens: number,
  promptChars = 0,
): number {
  const documentTokens =
    payload.type === "pdf"
      ? pages * TOKENS_PER_PDF_PAGE
      : Math.ceil(payload.text.length / CHARS_PER_TOKEN);
  const promptTokens = PROMPT_TOKENS + Math.ceil(promptChars / CHARS_PER_TOKEN);
  const input = (promptTokens + documentTokens) * PRICE_PER_MILLION.cacheWrite;
  const output = maxTokens * PRICE_PER_MILLION.output;
  return Math.max(MIN_RESERVATION_USD, Math.ceil(input + output) / 1e6);
}

/** What a segment call is reserved at (#342). */
export const estimateSegmentCost = (payload: ChunkPayload, pages: number): number =>
  estimateCallCost(payload, pages, SEGMENT_MAX_TOKENS);
