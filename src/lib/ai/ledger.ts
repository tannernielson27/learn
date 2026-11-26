import type { Database } from "@/lib/supabase/database.types";
import type { StructuredRequest } from "./claude";
import { PRICE_PER_MILLION, costOf, totalInputTokens, type Usage } from "./config";

/**
 * The usage ledger and the monthly cap, from the server (#342 on #340's functions; shared by
 * every AI feature since #621). Both calls are service-role only in the database; the caller has
 * checked that the user authors `orgId`, and passes the workspace from that check, never one from
 * the request.
 *
 * The order for every Claude call: `reserveUsage` first (nothing is sent if it refuses), then the
 * call, then `settleUsage` once with what Claude really billed, zeros when it billed nothing. A
 * reservation is taken once per call, however many times that call is retried, and a chunk's
 * pages ride on its first reservation only (its halves, when it is read in two, reserve none:
 * #590), so neither a retry nor a split charges the pages twice. A reservation left unsettled (a function killed mid-call) keeps
 * counting until the month ends: that only makes the cap stricter.
 *
 * Import and drafting draw on one cap (ADR 0018 decision 1): `public.ai_usage` keeps one row per
 * workspace and month, and each reservation records its `kind` beside it.
 */

/** What a reservation is for (`private.ai_usage_reservations.kind`). */
export const AI_USAGE_KINDS = ["import", "draft_rationale", "draft_variant"] as const;
export type AiUsageKind = (typeof AI_USAGE_KINDS)[number];

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
export const CHARS_PER_TOKEN = 3;
/** Cents of headroom so the ledger's six places never round a reservation under the real cost. */
export const MIN_RESERVATION_USD = 0.01;
/** The request's own framing around its text: roles, tags, the cache marker. */
const REQUEST_OVERHEAD_TOKENS = 200;

/**
 * What a call that sends no document chunk is reserved at (#621): a drafting call, whose input is
 * its rules, its schema and the question's own text. As for a chunk, the input is priced as if
 * none of it came from the cache and all of it were written to it, and the whole of `maxTokens` as
 * output; settling gives the rest back. A PDF or an image has no length to count here, so a
 * request that holds one is refused: a document chunk is estimated by import's
 * `estimateCallCost`.
 */
export function estimateRequestCost(request: StructuredRequest): number {
  let chars = request.system.length + JSON.stringify(request.schema).length;
  for (const block of request.content) {
    if (block.type !== "text") {
      throw new Error(`estimateRequestCost counts text only, not a ${block.type} block`);
    }
    chars += block.text.length;
  }
  const inputTokens = REQUEST_OVERHEAD_TOKENS + Math.ceil(chars / CHARS_PER_TOKEN);
  const input = inputTokens * PRICE_PER_MILLION.cacheWrite;
  const output = request.maxTokens * PRICE_PER_MILLION.output;
  return Math.max(MIN_RESERVATION_USD, Math.ceil(input + output) / 1e6);
}

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
  request: {
    orgId: string;
    /** The import batch a call is for; a drafting call has none. */
    batchId?: string;
    pages: number;
    costUsd: number;
    /** Left out, the database records `import`, as every call before #621 did. */
    kind?: AiUsageKind;
  },
): Promise<Reservation> {
  let answer: { data: Functions["reserve_ai_usage"]["Returns"] | null; error: unknown };
  try {
    answer = await rpc("reserve_ai_usage", {
      p_org: request.orgId,
      ...(request.batchId === undefined ? {} : { p_batch: request.batchId }),
      p_pages: request.pages,
      p_cost_usd: request.costUsd,
      ...(request.kind === undefined ? {} : { p_kind: request.kind }),
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
