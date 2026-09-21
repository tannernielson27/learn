/**
 * The participant token: what a student carries instead of an account.
 *
 * ## What it is
 *
 * An opaque bearer token in one httpOnly cookie, shaped `<sessionId>.<participantId>.<secret>`.
 * The secret is 24 random bytes drawn by Postgres at join time; the `participants` row keeps only
 * its SHA-256 hash, so the token is checked but never stored. It is not a Supabase credential and
 * not a JWT. Nothing in it is trusted until the database matches the hash.
 *
 * ## Why this and not the alternatives
 *
 * The criterion is that the token "grants exactly one session and cannot read answer keys, other
 * sessions, or any authoring table". Three designs were considered:
 *
 * 1. **A Supabase anonymous session.** It would give the browser a real `authenticated` JWT, and
 *    with it a direct line to the Data API. Every existing policy written `to authenticated`
 *    would then have an anonymous student on the other side of it, and the answer keys in
 *    `items.answer_key` are one policy mistake away. It also needs anonymous sign-ins turned on
 *    in two hosted projects (#136 split them) and grows `auth.users` by one row per student per
 *    class. Rejected: it widens the blast radius to argue about instead of narrowing it.
 *
 * 2. **A signed token this server mints** (HMAC or JWT over a server-only secret). Stateless, but
 *    it needs a new secret in every environment — one more thing to set, to rotate and to get
 *    wrong — and a leaked signing key mints any participant in any session, silently and without
 *    a way to revoke. The statelessness buys nothing here: every page that reads the token has to
 *    read the session row anyway.
 *
 * 3. **This one.** The token is a random secret the database issued and can revoke, and it names
 *    nothing but one participant in one session. It is checked by `resume_participant`, which is
 *    granted to `service_role` alone and returns a participant's own name and their session's
 *    status and title — no item set, no answer key, no other session, no authoring table. No
 *    new environment variable, and nothing new for an owner to set.
 *
 *    Since #149 a student's browser does hold one Supabase credential, and it is derived from
 *    this token rather than competing with it: a thirty-minute Realtime JWT, role `anon`, naming
 *    this token's session, minted only after `resume_participant` has matched this cookie. It
 *    opens that session's private channel and nothing else, and no route accepts it as proof of
 *    anything. This cookie is still the only participant identity. See
 *    `src/lib/supabase/channelToken.ts` for why the channel needs it and what it costs.
 *
 * The residual risk is the ordinary one for any bearer token: whoever holds it is that
 * participant. It is httpOnly (so script on the page cannot read it), Secure off localhost,
 * SameSite=Lax, scoped to this site, and expires with the class. Two hundred bits of entropy put
 * guessing out of reach, which is the point of the criterion "reload rejoins as the same
 * participant" not becoming "type a name and be someone else".
 *
 * Pure: no React, no Next, no Supabase. The cookie store is the caller's business.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 24 bytes, hex encoded, as `join_session` returns them. */
const SECRET = /^[0-9a-f]{48}$/;

/** One cookie, replaced when the same browser joins a different session. */
export const PARTICIPANT_COOKIE = "learn_participant";

/**
 * Twelve hours. Long enough that a class, a break and an afternoon session all fit; short enough
 * that a shared or borrowed phone is not still carrying a name the next day. The session itself
 * is the real authority — an ended session refuses whatever the cookie says — so this only bounds
 * how long a token is worth stealing.
 */
export const PARTICIPANT_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

export interface ParticipantToken {
  sessionId: string;
  participantId: string;
  secret: string;
}

/** Only the attributes that matter; typed structurally so a test needs no cookie store. */
export interface ParticipantCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/**
 * `secure` is the caller's decision because a local run is served over plain http, where a Secure
 * cookie would simply never be sent and joining would appear to do nothing.
 *
 * SameSite=Lax rather than Strict: a student arrives by scanning a QR code, which is a top-level
 * navigation from outside the site, and Strict would withhold the cookie on exactly that first
 * request. Lax still withholds it from cross-site POSTs, which is what matters here.
 */
export function participantCookieOptions(
  secure: boolean,
  maxAge: number = PARTICIPANT_COOKIE_MAX_AGE_SECONDS,
): ParticipantCookieOptions {
  return { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge };
}

export function formatParticipantToken(token: ParticipantToken): string {
  return `${token.sessionId}.${token.participantId}.${token.secret}`;
}

/**
 * Reads a cookie value back, or null when it is missing, malformed or the wrong shape. Checking
 * the shape here saves a database round trip for every piece of rubbish anyone posts, and it is
 * the only thing this module decides: whether the token is *valid* is `resume_participant`'s
 * answer, not this function's.
 */
export function parseParticipantToken(value: string | undefined | null): ParticipantToken | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;

  const [sessionId, participantId, secret] = parts;
  if (!UUID.test(sessionId) || !UUID.test(participantId) || !SECRET.test(secret)) return null;
  return { sessionId, participantId, secret };
}

/**
 * Reads this app's participant cookie out of a raw `Cookie` header, or null.
 *
 * A route handler is handed a Web `Request`, not a Next `cookies()` store, and the two live
 * session routes are driven straight from a `Request` by their tests — so the header is read
 * here, in the pure module that already owns what the cookie is called and what its value looks
 * like, rather than in the adapter that happens to need it.
 *
 * Only the first entry with this name is taken. Cookie values are not decoded unless they have to
 * be: a token is `<uuid>.<uuid>.<hex>`, which no writer percent-encodes, and a value that has been
 * encoded anyway still comes back right. Whatever comes out is a *candidate* — it is
 * `parseParticipantToken` that decides whether it is even shaped like a token, and
 * `resume_participant` that decides whether it is real.
 */
export function readParticipantCookie(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== PARTICIPANT_COOKIE) continue;
    const raw = part.slice(separator + 1).trim();
    if (raw === "") return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      // A value that is not valid percent-encoding is not one this app wrote. Hand it on as it
      // came rather than throwing inside a request: the shape check below it will refuse it.
      return raw;
    }
  }
  return null;
}
