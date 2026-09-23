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
 * it.
 *
 * **Two kinds of "no".** A refresh can fail because the network did (an error, a 5xx, a 429) or
 * because the server has said this phone is finished: a 401, meaning the cookie no longer names a
 * participant — the row or the session is gone — or `not_open`, meaning the session has ended. The
 * first kind is transient: the token held is handed back and the next heartbeat asks again. The
 * second is definitive and is not retried: asking again would get the same answer on every
 * heartbeat for as long as the tab stayed open, and a socket holding a dead token would sit on
 * "Reconnecting" for ever. So the source stops asking and tells whoever subscribed to
 * `onRefused`; the transport closes the channel and the room sends the page back to the server,
 * which answers a removed participant with the join form and an ended session with its own ended
 * screen. See `participantTransport.ts` and `StudentRoom.tsx`.
 *
 * Browser-safe: no `node:crypto`, no key. It only ever holds a token it was given.
 */
import type { Unsubscribe } from "@/lib/live/transport";
import { LIVE_ROUTES, type ChannelCredential, type RefusalPayload } from "./wire";

/**
 * How long before expiry a token is replaced. Longer than a heartbeat, so one always lands.
 *
 * Measured on the phone's clock against an `expiresAt` from the server's. A phone whose clock runs
 * more than this far slow would hold a token Realtime already calls expired; NTP makes that rare,
 * and the margin is what absorbs ordinary drift.
 */
export const CHANNEL_TOKEN_REFRESH_AHEAD_MS = 5 * 60 * 1000;

/**
 * Why the server will not issue this phone another token. `signed_out`: the cookie no longer names
 * a participant. `ended`: the session is over.
 */
export type ChannelRefusal = "signed_out" | "ended";

/** What a student's Realtime client is built with, and how its owner learns the phone is done. */
export interface ChannelTokenSource {
  /** The client's `accessToken` callback. Never rejects. */
  accessToken: () => Promise<string>;
  /** Called once, the first time the server refuses definitively. Never for a transient failure. */
  onRefused(listener: (why: ChannelRefusal) => void): Unsubscribe;
}

export interface ChannelTokenSourceOptions {
  /** The token the play page's server render minted. */
  initial: ChannelCredential;
  fetch?: typeof globalThis.fetch;
  /** Prefixed onto the route path. Empty in a browser, where it is same-origin. */
  baseUrl?: string;
  now?: () => number;
}

/**
 * The token source for a student's Supabase client.
 *
 * `accessToken` never rejects. Any failed refresh answers with the token already held: Realtime
 * then either carries on (the token was still good) or refuses the socket (it was not). Throwing
 * would surface in supabase-js as an unhandled warning and change nothing about the outcome.
 * Concurrent calls share one request. After a definitive refusal it never asks again.
 */
export function createChannelTokenSource(options: ChannelTokenSourceOptions): ChannelTokenSource {
  const call = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl ?? "";
  const now = options.now ?? Date.now;
  const listeners = new Set<(why: ChannelRefusal) => void>();
  let held: ChannelCredential = options.initial;
  let inFlight: Promise<string> | null = null;
  let refused: ChannelRefusal | null = null;

  function refuse(why: ChannelRefusal): void {
    if (refused !== null) return;
    refused = why;
    for (const listener of [...listeners]) listener(why);
  }

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
      if (!response.ok) {
        const why = await definitiveRefusal(response);
        if (why !== null) refuse(why);
        return held.token;
      }
      const next = (await response.json()) as Partial<ChannelCredential>;
      if (typeof next.token !== "string" || typeof next.expiresAt !== "number") return held.token;
      held = { token: next.token, expiresAt: next.expiresAt };
      return held.token;
    } catch {
      return held.token;
    }
  }

  return {
    accessToken: () => {
      if (refused !== null) return Promise.resolve(held.token);
      if (held.expiresAt - now() > CHANNEL_TOKEN_REFRESH_AHEAD_MS) {
        return Promise.resolve(held.token);
      }
      // Cleared in a `finally` on the promise, never inside `renew`: a fetch that threw
      // synchronously would otherwise clear the slot before it was filled, and pin a settled
      // promise in it.
      inFlight ??= renew().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    onRefused(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Whether a refused refresh is the server saying this phone is finished, and which way. Only two
 * answers are: 401 (the cookie names nobody) and the `not_open` refusal (the session has ended).
 * A 429, a 5xx, a body that is not JSON — anything else — is transient, and is retried.
 */
async function definitiveRefusal(response: Response): Promise<ChannelRefusal | null> {
  if (response.status === 401) return "signed_out";
  if (response.status !== 409) return null;
  try {
    const body = (await response.json()) as Partial<RefusalPayload>;
    return body.refusal === "not_open" ? "ended" : null;
  } catch {
    return null;
  }
}
