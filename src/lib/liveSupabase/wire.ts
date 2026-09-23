/**
 * What travels between a participant's browser and this app's own server, and the seam with #129.
 *
 * `src/lib/live` is pure by rule (ADR 0001, ADR 0002, and `purity.test.ts` enforces it), so the
 * Supabase adapter cannot live there. It lives here instead, and the dependency runs one way only:
 * `src/lib/liveSupabase` imports the interfaces from `@/lib/live`, and nothing in `@/lib/live`
 * knows this folder exists.
 *
 * Every shape below is a *participant's* payload, so every one of them is keyless until the host
 * reveals. `ParticipantViewPayload.item` is a `ParticipantItem`, whose `answerKey`, `rationale` and
 * `scoring` are branded `never` (#130): a mis-wired handler that put a host's item here would not
 * compile. `revealed` is the one field that ever carries a key, it is null until
 * `sessions.reveal` is true for the item the room is on, and the server decides that — not the
 * client asking nicely.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { LiveRefusal } from "@/lib/live";
import type { SessionMode, SessionStatus } from "@/lib/live";
import type { ParticipantItem } from "@/lib/live";
import type { ItemTimer } from "@/lib/live/timer";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { Reveal } from "@/lib/ngn/submit";
import type { ScoreResult } from "@/lib/ngn/types";

/** The routes this adapter owns. #129 owns `/api/live/join`. */
export const LIVE_ROUTES = {
  view: "/api/live/view",
  submit: "/api/live/submit",
  channel: "/api/live/channel",
} as const;

/**
 * What lets this phone's socket into its own session's private channel (#149): a short-lived
 * Supabase JWT, and when it stops working in epoch milliseconds.
 *
 * Not a participant credential. The httpOnly cookie is still the only thing any route accepts as
 * "this is participant X"; this token is minted from it, after it has been checked, and is only
 * ever presented to Realtime. See `src/lib/supabase/channelToken.ts`.
 */
export interface ChannelCredential {
  token: string;
  expiresAt: number;
}

/**
 * What a join has to hand back, and the whole of what this adapter needs from it.
 *
 * There is no credential in here any more. #131 carried a `token` that every later call presented
 * as `Authorization: Bearer <token>`; #133 deleted that scheme in favour of #129's httpOnly
 * cookie, which the browser attaches to these same-origin requests by itself and which no script
 * on the page can read. So the adapter holds nothing secret at all: what is below is who this
 * person is and what room they are in, all of it already on their screen.
 *
 * See `routeDeps.ts` for why the two schemes became one and why it is this one.
 */
export interface ParticipantCredentials {
  sessionId: string;
  /** Stable for one person in one session. Written to `session_responses.participant_id`. */
  participantId: string;
  /** The session's own code, as the server normalized it. */
  code: string;
  mode: SessionMode;
  displayName: string;
  /** Epoch milliseconds, from the server's clock. */
  joinedAt: number;
}

/**
 * Turning a typed code into a participant. #129's route; injected so this adapter neither
 * duplicates it nor waits for it.
 *
 * It rejects with `LiveSessionError("unknown_code")` when no open session has that code and
 * `LiveSessionError("not_open")` when the session has ended. The name is validated here before the
 * call is made, so `no_name` and `name_too_long` never reach it.
 */
export type JoinSession = (
  code: string,
  identity: { displayName: string; profileId?: string | null },
) => Promise<ParticipantCredentials>;

/**
 * The state fields a participant may know: the four `session_public_state` has always carried,
 * and since #182 the item's clock, which it carries too.
 */
export interface PublicStatePayload {
  status: SessionStatus;
  position: number | null;
  itemCount: number;
  reveal: boolean;
  timer: ItemTimer;
}

/** What the host has revealed, once it has. Null at every other moment. */
export interface RevealedPayload {
  itemId: string;
  position: number;
  reveal: Reveal;
  score: ScoreResult | null;
}

/**
 * This participant's own answer to the item the room is on, once they have given one.
 *
 * It is what makes a reload mid-answer land on the answer rather than on a blank form: the phone
 * asks the server what it already sent, instead of remembering it. The response is the one they
 * posted, read back to them and to nobody else — the route keys the read on the participant id
 * the cookie was checked against — and it is not a mark: no points, no maximum, no breakdown, and
 * no key. Those are `revealed`'s, and only once the host has revealed (ADR 0003).
 */
export interface AnsweredPayload {
  itemId: string;
  /** Epoch milliseconds, from the session's clock. */
  submittedAt: number;
  /** Their own response, validated against the item's own schema before it is sent back. */
  response: AnyResponse;
}

/** The body of a successful `POST /api/live/view`. */
export interface ParticipantViewPayload {
  state: PublicStatePayload;
  item: ParticipantItem | null;
  answered: AnsweredPayload | null;
  revealed: RevealedPayload | null;
  /**
   * The database's `now()` as it read the room, epoch ms (#182). What a phone measures its own
   * clock against, so a countdown is right on a phone whose clock is not. See `clockOffset`.
   */
  serverNow: number;
}

/** The body a participant posts to `/api/live/submit`. */
export interface SubmitRequestBody {
  itemId: string;
  response: unknown;
}

/** The body of a successful `POST /api/live/submit`: the acknowledgement and nothing else. */
export interface SubmitAckPayload {
  itemId: string;
  submittedAt: number;
}

/** How every route here says no, so the transport can turn it back into a `LiveSessionError`. */
export interface RefusalPayload {
  refusal: LiveRefusal;
  error: string;
}

/** Sent on every response from these routes: none of it may ever sit in a cache. */
export const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/**
 * The schema `session_public_state` lives in. Not `public`, and that is the point: row level
 * security cannot say "only if you already knew the id", so a table `anon` may read is a table
 * `anon` may list — and in `public` that list is a Data API route serving every session's uuid to
 * anyone holding the publishable key. `live` is not an exposed schema, so PostgREST has no route
 * to it at all while Realtime, which takes the schema as a subscription parameter, still does.
 */
export const LIVE_SCHEMA = "live";

/** The Realtime topic one session's participants and hosts share. */
export function liveTopic(sessionId: string): string {
  return `live:${sessionId}`;
}

/**
 * Hands Realtime this client's current token, and waits until it has it. Call before subscribing
 * to a private channel (#149).
 *
 * Not optional, and found the hard way against the local stack: supabase-js fetches a client's
 * token asynchronously after the client is built, and a channel subscribed before that lands joins
 * with the publishable key's default token instead. On a private channel that is a refusal — and
 * the socket's automatic rejoins keep presenting the same stale token, so it never recovers on its
 * own. `setAuth()` with no argument asks the client's own source: the channel token for a
 * student, the signed-in session for a host.
 *
 * A failure here is not thrown. The subscribe that follows is what reports whether the socket got
 * in, through the status every caller already handles.
 */
export async function presentRealtimeToken(
  client: Pick<SupabaseClient<Database>, "realtime">,
): Promise<void> {
  try {
    await client.realtime.setAuth();
  } catch {
    // Reported by the subscribe that follows, as CHANNEL_ERROR.
  }
}
