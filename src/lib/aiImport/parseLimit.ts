import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";

/**
 * How many chunks one teacher may send to Claude (#342, ADR 0008 "Safety"). A full batch is 5
 * files and 100 pages, about 15 PDF chunks or a few dozen text ones; 60 an hour is two full
 * batches with room for retries. The monthly cap bounds the money; this bounds the pace, so one
 * account cannot spend a workspace's month in a minute.
 */
export const AI_IMPORT_PARSE_LIMIT: RateLimit = { attempts: 60, windowMs: 60 * 60 * 1000 };

export type ParseAllowance = "ok" | "rate_limited" | "unavailable";

/**
 * Counts one parse call for `userId` (an account id, never an address; the store keeps only a
 * keyed digest). Never throws, and fails closed: no answer means no call.
 */
export async function takeParseCall(
  userId: string,
  store: RateLimitStore = sharedRateLimitStore(),
): Promise<ParseAllowance> {
  try {
    return (await store.hit("ai_import_parse", userId, AI_IMPORT_PARSE_LIMIT))
      ? "ok"
      : "rate_limited";
  } catch (error) {
    console.error("[ai-import] the shared rate limiter could not answer, so nothing was sent", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return "unavailable";
  }
}
