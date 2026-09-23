import { createHmac, createPrivateKey, sign, type KeyObject } from "node:crypto";

/**
 * The Realtime channel token (#149): a short-lived Supabase JWT that lets one participant's socket
 * into one session's channel, and nowhere else.
 *
 * ## It is not a second participant identity
 *
 * #133 left exactly one answer to "who is this participant?": #129's httpOnly cookie, checked by
 * `resume_participant`. This token does not compete with it. It is only ever minted *after* that
 * check has passed — on the play page's server render and by `POST /api/live/channel`, both of
 * which verify the cookie first — and it carries nothing the cookie did not already establish:
 * the session id and the participant id `resume_participant` just confirmed. Nothing on the server
 * ever accepts it as proof of anything. The routes still read the cookie; the only reader of this
 * token is Realtime, and all Realtime does with it is evaluate the `realtime.messages` and
 * `live.session_public_state` policies in `20260921210000_private_live_channel.sql`.
 *
 * It exists because the cookie cannot do this job. Realtime authorizes a socket from the JWT the
 * socket presents, and a cookie that script on the page cannot read — which is the point of it —
 * is not something a WebSocket can present. So the server that can read the cookie vouches for
 * the socket, in the one format Realtime understands.
 *
 * ## What it grants
 *
 * `role: "anon"` — the same Postgres role the publishable key already gives every browser, with
 * none of `authenticated`'s policies. That is the objection `participantToken.ts` records against
 * a Supabase anonymous session ("every policy written `to authenticated` would then have an
 * anonymous student on the other side of it"), and it does not apply here: this token *narrows*
 * what the anonymous role can see, it does not widen it. The one extra thing it carries is the
 * `live_session_id` claim, which is what the channel policies match the topic against.
 *
 * ## Why it needs a key someone has to set
 *
 * `participantToken.ts` chose #129's design partly because it needs no signing key. This token
 * cannot avoid one: Realtime only believes a JWT signed by a key the project trusts, and the
 * project's keys live in the Supabase dashboard. `SUPABASE_JWT_SIGNING_KEY` is that key, and it is
 * read here and nowhere else. See `.env.example` for exactly what to paste and where it comes from.
 *
 * Server only. `node:crypto` would fail a browser build outright, which is the intended guard.
 */

/** The claim the channel policies read. One name, used by the SQL and by this file. */
export const CHANNEL_SESSION_CLAIM = "live_session_id";

/**
 * Thirty minutes. Short, as Supabase asks of a Realtime JWT — the socket is dropped when the
 * token it presented expires — and long enough that a phone refreshes it a couple of times an
 * hour rather than a couple of times a minute. The browser refreshes it five minutes early, from
 * `POST /api/live/channel`, which checks the cookie again each time. See `channelTokenSource.ts`.
 */
export const CHANNEL_TOKEN_TTL_SECONDS = 30 * 60;

const KEY_VAR = "SUPABASE_JWT_SIGNING_KEY";

/** Supabase requires a legacy JWT secret of at least 32 characters. */
const MIN_SECRET_LENGTH = 32;

export type ChannelSigningKey =
  { alg: "HS256"; secret: string } | { alg: "ES256"; kid: string; key: KeyObject };

export interface ChannelTokenClaims {
  role: "anon";
  /** The participant id. Not an `auth.users` id: nothing in Postgres treats it as one. */
  sub: string;
  [CHANNEL_SESSION_CLAIM]: string;
  iat: number;
  exp: number;
}

/** What the browser is handed: the token, and when it stops working, in epoch milliseconds. */
export interface MintedChannelToken {
  token: string;
  expiresAt: number;
}

/**
 * Reads the key the channel token is signed with, or throws naming exactly what is missing.
 *
 * Two shapes are accepted, because a Supabase project has one of two kinds of key it will trust:
 *
 *  * **The legacy JWT secret** (HS256): a plain string, at least 32 characters. Every project
 *    that has not revoked it has one; the local stack prints it as `JWT_SECRET`.
 *  * **An imported ES256 signing key**: the private JWK, as JSON, exactly as
 *    `supabase gen signing-key --algorithm ES256` prints it — `kty: "EC"`, `crv: "P-256"`, `d`,
 *    `x`, `y` and a `kid`. This is Supabase's documented way to mint JWTs once a project has moved
 *    off the legacy secret, because a key Supabase generated cannot be extracted.
 *
 * Nothing else is guessed at. A value that is neither is refused rather than tried.
 */
export function readChannelSigningKey(
  raw: string | undefined = process.env.SUPABASE_JWT_SIGNING_KEY,
): ChannelSigningKey {
  const value = raw?.trim();
  if (!value) {
    throw new Error(
      `${KEY_VAR} is not set. See .env.example; it is required for a student to open a live session.`,
    );
  }
  if (value.startsWith("{")) return readJwk(value);
  if (value.startsWith("sb_")) {
    throw new Error(
      `${KEY_VAR} holds an API key. It needs the project's JWT signing key; see .env.example.`,
    );
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${KEY_VAR} is too short to be a Supabase JWT secret.`);
  }
  return { alg: "HS256", secret: value };
}

function readJwk(value: string): ChannelSigningKey {
  let jwk: Record<string, unknown>;
  try {
    jwk = JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error(`${KEY_VAR} starts like a JWK but is not valid JSON.`);
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.d !== "string") {
    throw new Error(`${KEY_VAR} must be an ES256 private key (kty "EC", crv "P-256", with "d").`);
  }
  if (typeof jwk.kid !== "string" || jwk.kid === "") {
    throw new Error(`${KEY_VAR} needs the "kid" Supabase was given when the key was imported.`);
  }
  try {
    const key = createPrivateKey({ key: jwk as never, format: "jwk" });
    return { alg: "ES256", kid: jwk.kid, key };
  } catch {
    throw new Error(`${KEY_VAR} is not a usable ES256 private key.`);
  }
}

/** The claims for one participant in one session. Pure, so a test needs no key at all. */
export function channelTokenClaims(
  participant: { sessionId: string; participantId: string },
  nowSeconds: number,
  ttlSeconds: number = CHANNEL_TOKEN_TTL_SECONDS,
): ChannelTokenClaims {
  return {
    role: "anon",
    sub: participant.participantId,
    [CHANNEL_SESSION_CLAIM]: participant.sessionId,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };
}

/**
 * Signs a channel token for a participant the caller has **already verified** through the
 * participant cookie. This function checks nothing about who is asking; that is the whole reason
 * it is only called from the two places that have just run `resume_participant`.
 */
export function mintChannelToken(
  participant: { sessionId: string; participantId: string },
  key: ChannelSigningKey,
  nowMs: number = Date.now(),
): MintedChannelToken {
  const claims = channelTokenClaims(participant, Math.floor(nowMs / 1000));
  const header =
    key.alg === "HS256" ? { alg: "HS256", typ: "JWT" } : { alg: "ES256", typ: "JWT", kid: key.kid };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature =
    key.alg === "HS256"
      ? createHmac("sha256", key.secret).update(signingInput).digest()
      : // JOSE wants the raw r||s pair, not the DER a bare `sign` produces by default.
        sign("sha256", Buffer.from(signingInput), { key: key.key, dsaEncoding: "ieee-p1363" });
  return { token: `${signingInput}.${base64url(signature)}`, expiresAt: claims.exp * 1000 };
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}
