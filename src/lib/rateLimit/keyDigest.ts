import { createHmac } from "node:crypto";

/**
 * How a rate limit key becomes what the database stores (#234): HMAC-SHA256 under a key derived
 * from the server's Supabase secret key, never the IP address or email address itself.
 *
 * Why a keyed hash and not a plain SHA-256: there are only four billion IPv4 addresses, so a plain
 * digest of one is reversed by trying them all. Without the server's secret the HMAC cannot be.
 *
 * Why derived from `SUPABASE_SECRET_KEY` rather than a new variable: it is already required on
 * every deployment that can reach the limiter (the limiter calls the database with it), it is
 * already server-only, and a missing key already fails closed. The label keeps the derived key
 * distinct from any other use of the secret. Rotating the secret key starts every window over,
 * which costs at most five minutes of counting.
 *
 * The bucket is part of the message, so the same address digests differently in every bucket and
 * the table cannot be joined across buckets to follow one caller.
 */
export const RATE_LIMIT_KEY_LABEL = "learn/shared-rate-limit-keys/v1";

export function deriveRateLimitKey(serverSecret: string): Buffer {
  if (serverSecret.trim() === "") {
    throw new Error("The rate limiter needs the server secret to hash its keys.");
  }
  return createHmac("sha256", serverSecret).update(RATE_LIMIT_KEY_LABEL, "utf8").digest();
}

/** 64 lower-case hex digits, the only shape `private.shared_rate_limits` accepts. */
export function digestRateLimitKey(derivedKey: Buffer, bucket: string, key: string): string {
  // Length-prefixed, so no bucket and key pair can be rearranged into another.
  return createHmac("sha256", derivedKey)
    .update(`${bucket.length}:${bucket}\n${key}`, "utf8")
    .digest("hex");
}
