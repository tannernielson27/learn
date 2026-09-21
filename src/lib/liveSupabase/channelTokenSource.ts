/**
 * Where a student's Realtime client gets its channel token from, for as long as the class runs
 * (#149).
 *
 * The Supabase client is built with this as its `accessToken` callback, and Realtime calls it on
 * connect and on every heartbeat. So this is not a timer and not a second connection: it answers
 * with the token it holds, and only goes to the server when that token is within five minutes of
 * expiring. The first token comes from the play page's server render; every later one from
 * `POST /api/live/channel`, which checks the participant cookie again each time.
 *
 * **Why expiry matters.** Realtime drops a socket whose token has expired unless a newer one has
 * been sent on it. Without this, a class longer than thirty minutes would lose its roster and its
 * room moves half an hour in. With it, a phone that is awake refreshes silently, twice an hour.
 *
 * **A phone that slept through its expiry** wakes holding a dead token. The first heartbeat asks
 * here, this sees the token is stale and fetches a fresh one, and the socket's reconnect presents
 * it. The one case that does not recover is a participant the server no longer recognises — whose
 * row, or whose session, has gone — and that is the correct answer: `router.refresh()` on the
 * next rejoin sends them to the join form.
 *
 * Browser-safe: no `node:crypto`, no key. It only ever holds a token it was given.
 */
import { LIVE_ROUTES, type ChannelCredential } from "./wire";

/** How long before expiry a token is replaced. Longer than a heartbeat, so one always lands. */
export const CHANNEL_TOKEN_REFRESH_AHEAD_MS = 5 * 60 * 1000;

export interface ChannelTokenSourceOptions {
  /** The token the play page's server render minted. */
  initial: ChannelCredential;
  fetch?: typeof globalThis.fetch;
  /** Prefixed onto the route path. Empty in a browser, where it is same-origin. */
  baseUrl?: string;
  now?: () => number;
}

/**
 * An `accessToken` callback for the student's Supabase client.
 *
 * It never rejects. A refresh that fails — a dropped connection, a 429, a room that has ended —
 * answers with the token already held: Realtime then either carries on (the token was still
 * good) or refuses the socket (it was not), and the next heartbeat asks again. Throwing here
 * would surface in supabase-js as an unhandled warning and change nothing about the outcome.
 * Concurrent calls share one request.
 */
export function createChannelTokenSource(
  options: ChannelTokenSourceOptions,
): () => Promise<string> {
  const call = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl ?? "";
  const now = options.now ?? Date.now;
  let held: ChannelCredential = options.initial;
  let inFlight: Promise<string> | null = null;

  async function renew(): Promise<string> {
    try {
      const response = await call(`${base}${LIVE_ROUTES.channel}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The participant cookie is httpOnly; the browser attaches it. It is the whole of this
        // request's authority, exactly as it is for the view and submit routes.
        credentials: "same-origin",
        body: "{}",
      });
      if (!response.ok) return held.token;
      const next = (await response.json()) as Partial<ChannelCredential>;
      if (typeof next.token !== "string" || typeof next.expiresAt !== "number") return held.token;
      held = { token: next.token, expiresAt: next.expiresAt };
      return held.token;
    } catch {
      return held.token;
    }
  }

  return () => {
    if (held.expiresAt - now() > CHANNEL_TOKEN_REFRESH_AHEAD_MS) return Promise.resolve(held.token);
    // Cleared in a `finally` on the promise, never inside `renew`: a fetch that threw synchronously
    // would otherwise clear the slot before it was filled, and pin a settled promise in it.
    inFlight ??= renew().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
