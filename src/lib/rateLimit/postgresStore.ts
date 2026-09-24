import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServiceClient, readSupabaseSecretKey } from "@/lib/supabase/service";
import { deriveRateLimitKey, digestRateLimitKey } from "./keyDigest";
import { RateLimitUnavailableError, type RateLimitStore } from "./store";

/** The one call this store makes. Narrow, so a test can hand in a plain function. */
export type RateLimitRpc = (
  name: "hit_rate_limit",
  args: Database["public"]["Functions"]["hit_rate_limit"]["Args"],
) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export interface PostgresRateLimitDeps {
  /** Built on first use, so nothing is created until a limit is actually counted. */
  rpc: () => RateLimitRpc;
  /** The server's Supabase secret key, which the HMAC key is derived from. */
  secret: () => string;
}

function serviceRpc(): RateLimitRpc {
  const client: SupabaseClient<Database> = createSupabaseServiceClient();
  return (name, args) => client.rpc(name, args);
}

const DEFAULT_DEPS: PostgresRateLimitDeps = {
  rpc: serviceRpc,
  secret: () => readSupabaseSecretKey(),
};

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/**
 * The production store: `public.hit_rate_limit`, which only the service role may call. Each key is
 * hashed here, before it leaves the server (see `keyDigest.ts`).
 *
 * Fails closed by construction: a missing secret, a failed call or an answer that is not a boolean
 * all reject with `RateLimitUnavailableError`, and never resolve true.
 */
export function createPostgresRateLimitStore(
  deps: PostgresRateLimitDeps = DEFAULT_DEPS,
): RateLimitStore {
  let derivedKey: Buffer | undefined;
  let rpc: RateLimitRpc | undefined;

  return {
    async hit(bucket, key, limit) {
      let answer: Awaited<ReturnType<RateLimitRpc>>;
      try {
        derivedKey ??= deriveRateLimitKey(deps.secret());
        rpc ??= deps.rpc();
        answer = await rpc("hit_rate_limit", {
          bucket_name: bucket,
          key_digest: digestRateLimitKey(derivedKey, bucket, key),
          max_hits: limit.attempts,
          window_seconds: Math.ceil(limit.windowMs / 1_000),
        });
      } catch (error) {
        throw new RateLimitUnavailableError(reasonOf(error));
      }
      if (answer.error) throw new RateLimitUnavailableError(answer.error.code ?? "error");
      if (typeof answer.data !== "boolean") throw new RateLimitUnavailableError("no answer");
      return answer.data;
    },
  };
}

// Pinned to globalThis so an edit in development, which re-evaluates the module, and two server
// bundles of it share one client and one derived key.
const shared = globalThis as typeof globalThis & { __learnRateLimitStore?: RateLimitStore };

/** The store every limiter uses unless a test hands it another. */
export function sharedRateLimitStore(): RateLimitStore {
  return (shared.__learnRateLimitStore ??= createPostgresRateLimitStore());
}
