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
import type { LiveRefusal } from "@/lib/live";
import type { SessionMode, SessionStatus } from "@/lib/live";
import type { ParticipantItem } from "@/lib/live";
import type { Reveal } from "@/lib/ngn/submit";
import type { ScoreResult } from "@/lib/ngn/types";

/** The routes this adapter owns. #129 owns `/api/live/join`. */
export const LIVE_ROUTES = {
  view: "/api/live/view",
  submit: "/api/live/submit",
} as const;

/**
 * What #129's join path has to hand back, and the whole of what #131 needs from it.
 *
 * This is written as a contract rather than an import because the two stories were built in
 * parallel: #129 owns `public.participants`, the join route and the token. `token` is opaque here
 * — this adapter never reads it, it only presents it — so #129 may make it a signed string, a row
 * id or a cookie the browser sends by itself, and nothing below changes.
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
  /** Presented as `Authorization: Bearer <token>` on every later call. Never inspected here. */
  token: string;
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

/** The state fields a participant may know. The same four `session_public_state` carries. */
export interface PublicStatePayload {
  status: SessionStatus;
  position: number | null;
  itemCount: number;
  reveal: boolean;
}

/** What the host has revealed, once it has. Null at every other moment. */
export interface RevealedPayload {
  itemId: string;
  position: number;
  reveal: Reveal;
  score: ScoreResult | null;
}

/** The body of a successful `POST /api/live/view`. */
export interface ParticipantViewPayload {
  state: PublicStatePayload;
  item: ParticipantItem | null;
  revealed: RevealedPayload | null;
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
