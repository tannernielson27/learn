import { createHmac } from "node:crypto";
import { startingOrderSeed } from "@/lib/ngn/startingOrder";

/**
 * The seed for an ordered-response item's starting order where a student plays it (#219).
 *
 * The scramble itself is public (it ships to the gallery), and a student can see the session id,
 * the attempt id and the item id. With those as the seed, a student could replay the scramble,
 * undo it, and read off the authored order, which is usually the key. So the server keys the seed
 * with a secret the browser never has: an HMAC over the scope and the item, under the project's
 * secret key, with a label so the digest is useful for nothing else. It stays stable for a room
 * or an attempt, which is all the starting order needs.
 *
 * Server only. Without a secret key there is no service client either, so no student-facing route
 * can serve an item; the public seed is kept for that case only (tests, the gallery's fake room).
 */
export function secretStartingOrderSeed(scopeId: string, itemId: string): string {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return startingOrderSeed(scopeId, itemId);
  return createHmac("sha256", secret)
    .update(JSON.stringify(["learn:ordered-start:v1", scopeId, itemId]))
    .digest("hex");
}
