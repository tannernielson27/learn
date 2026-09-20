/**
 * What the two live-session route handlers need, and how they get it in production.
 *
 * Injected rather than imported so the conformance suite can drive the real handlers against a
 * stand-in database, and so #129 can swap the one thing it owns — how a request is turned into a
 * participant — without touching either handler.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveRefusal } from "@/lib/live";
import { LIVE_REFUSALS } from "@/lib/live";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { participantFromRequest, type VerifiedParticipant } from "./participantToken";
import { NO_STORE_HEADERS, type RefusalPayload } from "./wire";

/** Turns a request into the participant making it, or null. See `participantToken.ts`. */
export type ParticipantVerifier = (request: Request) => Promise<VerifiedParticipant | null>;

export interface LiveRouteDeps {
  verify: ParticipantVerifier;
  /**
   * The service-role client. It bypasses row level security, which is the point: a participant
   * has no Postgres identity at all. Every table it touches here is one no student role can read,
   * and every write goes through `record_session_response`, which does its own checking.
   */
  service: SupabaseClient<Database>;
}

export function liveRouteDeps(): LiveRouteDeps {
  return { verify: participantFromRequest, service: createSupabaseServiceClient() };
}

export const LIVE_ROUTE_ERRORS = {
  signedOut: "You have not joined this session.",
  unplayable: "This item has a problem and cannot be shown.",
  tooLarge: "That answer is too large to check.",
  failed: "The session could not be reached. Try again.",
} as const;

/** How an ordinary classroom refusal is carried over HTTP. Codes, not prose, are what branch. */
const REFUSAL_STATUS: Partial<Record<LiveRefusal, number>> = {
  not_joined: 401,
  rate_limited: 429,
  malformed: 400,
  wrong_type: 400,
  no_name: 400,
  name_too_long: 400,
  unknown_code: 404,
};

export function refuse(refusal: LiveRefusal): Response {
  const body: RefusalPayload = { refusal, error: LIVE_REFUSALS[refusal] };
  return Response.json(body, {
    // 409 is the default because every other refusal here is "the room is not in a state where
    // that means anything": paused, revealed, moved on, over.
    status: REFUSAL_STATUS[refusal] ?? 409,
    headers: NO_STORE_HEADERS,
  });
}

export function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE_HEADERS });
}

/** Every refusal the database answers with, checked rather than trusted. */
const DATABASE_REFUSALS = new Set<string>([
  "not_open",
  "not_started",
  "paused",
  "already_revealed",
  "wrong_item",
  "already_answered",
  "rate_limited",
]);

/**
 * Reads a refusal code out of a function's answer. An unrecognised string is not passed through as
 * a refusal — it would end up in a person's face as an empty message — it is a fault.
 */
export function asRefusal(value: unknown): LiveRefusal | null {
  return typeof value === "string" && DATABASE_REFUSALS.has(value) ? (value as LiveRefusal) : null;
}
