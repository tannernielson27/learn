import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitBucket, RateLimitStore } from "@/lib/rateLimit/store";
import type { AiUsageKind } from "./ledger";

/**
 * How many drafting calls one teacher may make (#621, ADR 0018 decision 5): 30 suggested
 * rationales and 30 variants an hour, each in its own bucket of the shared limiter
 * (`public.hit_rate_limit`). A teacher drafting by hand presses a button at most every few
 * minutes; 30 leaves room for that and stops a script from spending a workspace's month in an
 * hour. The monthly cap bounds the money; this bounds the pace.
 */

export type DraftKind = Exclude<AiUsageKind, "import">;

const HOUR_MS = 60 * 60 * 1000;

export const AI_DRAFT_LIMITS: Readonly<
  Record<DraftKind, { bucket: RateLimitBucket; limit: Readonly<RateLimit> }>
> = {
  draft_rationale: { bucket: "ai_draft_rationale", limit: { attempts: 30, windowMs: HOUR_MS } },
  draft_variant: { bucket: "ai_draft_variant", limit: { attempts: 30, windowMs: HOUR_MS } },
};

export type DraftAllowance = "ok" | "rate_limited" | "unavailable";

/**
 * Counts one drafting call of `kind` for `userId` (an account id, never an address; the store
 * keeps only a keyed digest). Never throws, and fails closed: no answer means no call.
 */
export async function takeDraftCall(
  kind: DraftKind,
  userId: string,
  store: RateLimitStore = sharedRateLimitStore(),
): Promise<DraftAllowance> {
  const { bucket, limit } = AI_DRAFT_LIMITS[kind];
  try {
    return (await store.hit(bucket, userId, limit)) ? "ok" : "rate_limited";
  } catch (error) {
    console.error("[ai-draft] the shared rate limiter could not answer, so nothing was sent", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return "unavailable";
  }
}
