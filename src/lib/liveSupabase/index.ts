/**
 * `src/lib/liveSupabase` — the Supabase Realtime adapter for `LiveSessionTransport` (#131).
 *
 * **Why it is not in `src/lib/live`.** That folder is pure by rule: ADR 0001 and ADR 0002 keep it
 * free of React, Next and Supabase so the interface cannot leak vendor types, and
 * `src/lib/live/purity.test.ts` fails the build if anything there so much as imports
 * `@supabase/*`. An adapter that talks to Supabase therefore cannot live beside the interface it
 * implements. It lives here, and the dependency runs one way only: this folder imports
 * `@/lib/live` and `@/lib/supabase`, and neither of them imports this one.
 *
 * It is its own folder rather than more files in `src/lib/supabase` because that folder is thin
 * wrappers — one function per row shape or RPC — while this is a transport: two long-lived
 * connections, a channel, a state machine and two route handlers. Keeping them apart means
 * "everything Supabase" does not become one drawer.
 */
export { createSupabaseHost, type HostTransportOptions } from "./hostTransport";
export {
  createSupabaseParticipant,
  publicStateFrom,
  type ParticipantTransportOptions,
  type ResumedIdentity,
  type RoomConnection,
  type StudentView,
  type SupabaseParticipant,
} from "./participantTransport";
export { rosterFrom, type PresenceEntry } from "./presence";
export {
  LIVE_ROUTE_ERRORS,
  liveRouteDeps,
  participantFromCookie,
  type LiveRouteDeps,
  type ParticipantVerifier,
  type VerifiedParticipant,
} from "./routeDeps";
export { submitSessionResponse } from "./submitRoute";
export { readParticipantView } from "./viewRoute";
export {
  LIVE_ROUTES,
  liveTopic,
  type AnsweredPayload,
  type JoinSession,
  type PacedItemPayload,
  type ParticipantCredentials,
  type ParticipantViewPayload,
  type PublicStatePayload,
  type RefusalPayload,
  type RevealedPayload,
  type SubmitAckPayload,
  type SubmitRequestBody,
} from "./wire";
