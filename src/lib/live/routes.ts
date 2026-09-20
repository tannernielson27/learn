import { normalizeSessionCode } from "./sessionCode";

/**
 * The two addresses a student ever sees. One place of truth, because the same paths are typed on
 * a phone, printed into a QR code on the host's screen, redirected to by the join action and
 * matched by the routes themselves.
 *
 * The code is in the path rather than a query string: it is shorter, which matters for how dense
 * the QR code has to be, and it survives being read aloud.
 *
 * The session page is keyed by session id, not by the join code, although
 * `docs/02-ARCHITECTURE.md` §2 sketched `/play/[sessionCode]`. A code is unique only among
 * sessions that have not ended (#128), so it is reused over time; a URL keyed by one could name
 * a different class next term than the participant token in the browser does. The id cannot.
 *
 * Pure: no React, no Next, no Supabase.
 */
export const JOIN_PATH = "/join";

export function joinPath(code: string): string {
  return `${JOIN_PATH}/${normalizeSessionCode(code)}`;
}

/** The absolute address a QR code carries. `origin` comes from the request the host made. */
export function joinUrl(origin: string, code: string): string {
  return new URL(joinPath(code), origin).toString();
}

/** Where a participant lands once they are in, and where a reload takes them back to. */
export function playPath(sessionId: string): string {
  return `/play/${sessionId}`;
}
