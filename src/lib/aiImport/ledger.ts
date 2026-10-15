import type { Database } from "@/lib/supabase/database.types";
import {
  PRICE_PER_MILLION,
  SEGMENT_MAX_TOKENS,
  costOf,
  totalInputTokens,
  type Usage,
} from "./config";
import type { ChunkPayload } from "./files/prepare";

/**
 * The usage ledger and the monthly cap, from the server (#342 on #340's functions). Both calls are
 * service-role only in the database; the caller has checked that the user authors `orgId`, and
 * passes the workspace from that check, never one from the request.
 *
 * The order for every Claude call: `reserveUsage` first (nothing is sent if it refuses), then the
 * call, then `settleUsage` once with what Claude really billed, zeros when it billed nothing. A
 * reservation is taken once per chunk, however many times the call is retried, so a retry never
 * charges the pages twice. A reservation left unsettled (a function killed mid-call) keeps
 * counting until the month ends: that only makes the cap stricter.
 */

type Functions = Database["public"]["Functions"];

type UsageFunction = "reserve_ai_usage" | "settle_ai_usage";

/** The two calls the ledger makes. Narrow, so a test can hand in a plain function. */
export type UsageRpc = <N extends UsageFunction>(
  name: N,
  args: Functions[N]["Args"],
) => PromiseLike<{ data: Functions[N]["Returns"] | null; error: unknown }>;

export type Reservation =
  | { ok: true; reservationId: string; remainingUsd: number; remainingPages: number | null }
  | { ok: false; reason: "cap_reached"; remainingUsd: number; remainingPages: number | null }
  | { ok: false; reason: "disabled" | "unavailable" };

/** About 4 characters a token for English; rounded towards reserving more. */
const CHARS_PER_TOKEN = 3;
/** A PDF page sent as a document: its text plus its page image, about 1,500 + 1,600 tokens. */
const TOKENS_PER_PDF_PAGE = 3_200;
/** The rules, the schema and the request around the document. */
const PROMPT_TOKENS = 3_000;
/** Cents of headroom so the ledger's six places never round a reservation under the real cost. */
const MIN_RESERVATION_USD = 0.01;

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

const logged = (step: string, error: unknown) => {
  // The code and nothing else.
  const code = (error as { code?: unknown } | null)?.code;
  console.error(`[ai-import] ${step} failed`, { code: typeof code === "string" ? code : null });
};

const asNumber = (value: unknown): number | null => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
};

export async function reserveUsage(
  rpc: UsageRpc,
  request: { orgId: string; batchId: string; pages: number; costUsd: number },
): Promise<Reservation> {
  let answer: { data: Functions["reserve_ai_usage"]["Returns"] | null; error: unknown };
  try {
    answer = await rpc("reserve_ai_usage", {
      p_org: request.orgId,
      p_batch: request.batchId,
      p_pages: request.pages,
      p_cost_usd: request.costUsd,
    });
  } catch (error) {
    logged("reserving AI usage", error);
    return { ok: false, reason: "unavailable" };
  }
  if (answer.error) {
    logged("reserving AI usage", answer.error);
    return { ok: false, reason: "unavailable" };
  }
  const row = Array.isArray(answer.data) ? answer.data[0] : undefined;
  if (!row) return { ok: false, reason: "unavailable" };
  // The generated types call these numbers; a numeric arrives as a string, and null is "no cap".
  const remainingUsd = asNumber(row.remaining_usd) ?? 0;
  const remainingPages = asNumber(row.remaining_pages);
  if (row.allowed === true && row.reason === "ok" && typeof row.reservation_id === "string") {
    return { ok: true, reservationId: row.reservation_id, remainingUsd, remainingPages };
  }
  if (row.reason === "disabled") return { ok: false, reason: "disabled" };
  if (row.reason === "cap_reached") {
    return { ok: false, reason: "cap_reached", remainingUsd, remainingPages };
  }
  return { ok: false, reason: "unavailable" };
}

export type Settlement = "settled" | "already_settled" | "unavailable";

/** Settles a reservation with what Claude billed. Pages are counted only for a chunk that parsed. */
export async function settleUsage(
  rpc: UsageRpc,
  reservationId: string,
  outcome: { pages: number; usage: Usage },
): Promise<Settlement> {
  try {
    const { data, error } = await rpc("settle_ai_usage", {
      p_reservation: reservationId,
      p_pages: outcome.pages,
      p_input_tokens: totalInputTokens(outcome.usage),
      p_output_tokens: outcome.usage.outputTokens,
      p_cost_usd: costOf(outcome.usage),
    });
    if (error) {
      logged("settling AI usage", error);
      return "unavailable";
    }
    return data === true ? "settled" : "already_settled";
  } catch (error) {
    logged("settling AI usage", error);
    return "unavailable";
  }
}
