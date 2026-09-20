/**
 * Who is answering, on a request that carries no signed-in user.
 *
 * A live session's participants are not accounts: a student types a code and a name (#129). The
 * two routes in this folder still have to know, for every call, *which participant in which
 * session* is speaking — `session_responses.participant_id` is the whole basis of "you have
 * already answered this item", and a participant id a browser could simply assert would let
 * anyone answer as anyone.
 *
 * So the identity is a short, signed bearer token. It carries a session id, a participant id and
 * an expiry, and an HMAC over all three; nothing else, and nothing secret. It is not a session
 * cookie and cannot be used to sign in: presenting it lets you answer questions in one room until
 * it expires, which is exactly the authority a participant has.
 *
 * **The seam with #129.** #129 owns `public.participants`, the join route and the decision of what
 * a token is. This module is the minimal contract #131 needs so it could be built alongside: a
 * join route that calls `signParticipantToken` gets a working system for free, and a join route
 * that mints something else replaces one function — `LiveRouteDeps.verify` — and nothing else in
 * this folder changes. Whichever way it goes, the token's shape is not baked into the transport,
 * the routes, the tables or the tests.
 *
 * HMAC-SHA256 over Web Crypto, so the routes run on the Node and the Edge runtime alike.
 */

/** Who a verified token says is speaking. */
export interface VerifiedParticipant {
  sessionId: string;
  participantId: string;
}

/** How long a token is good for. A class is an hour; a long lab is not much more. */
export const PARTICIPANT_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

const SECRET_VAR = "LIVE_PARTICIPANT_SECRET";
const VERSION = "v1";
const encoder = new TextEncoder();

/**
 * Reads the signing secret. Server-only by construction: no `NEXT_PUBLIC_` prefix, so Next
 * replaces it with undefined in anything that could reach a browser bundle.
 */
export function readParticipantSecret(raw: string | undefined = process.env[SECRET_VAR]): string {
  const secret = raw?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      `${SECRET_VAR} is not set to at least 32 characters. See .env.example; live sessions cannot ` +
        `take answers without it.`,
    );
  }
  return secret;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function keyFor(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Mints a token for one participant in one session. The join route (#129) is the only thing that
 * should ever call this: it is the only place that has decided the person may be in the room.
 */
export async function signParticipantToken(
  participant: VerifiedParticipant,
  options: { secret?: string; now?: () => number; ttlMs?: number } = {},
): Promise<string> {
  const secret = options.secret ?? readParticipantSecret();
  const now = options.now ?? Date.now;
  const body = base64url(
    encoder.encode(
      JSON.stringify({
        s: participant.sessionId,
        p: participant.participantId,
        e: now() + (options.ttlMs ?? PARTICIPANT_TOKEN_TTL_MS),
      }),
    ),
  );
  const signature = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(body));
  return `${VERSION}.${body}.${base64url(new Uint8Array(signature))}`;
}

/**
 * Reads a token back, or null. Null is the only failure: an expired token, a forged one and a
 * garbled one are told apart nowhere, because the answer to all three is the same and telling
 * them apart is free information for whoever is trying.
 *
 * The signature is checked with `crypto.subtle.verify`, which is constant time, and it is checked
 * *before* the payload is parsed, so nothing a caller wrote is acted on until it is known to have
 * come from this server.
 */
export async function verifyParticipantToken(
  token: string | null | undefined,
  options: { secret?: string; now?: () => number } = {},
): Promise<VerifiedParticipant | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, body, signature] = parts as [string, string, string];

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await keyFor(options.secret ?? readParticipantSecret()),
      fromBase64url(signature),
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as {
      s?: unknown;
      p?: unknown;
      e?: unknown;
    };
    if (typeof claims.s !== "string" || typeof claims.p !== "string") return null;
    if (typeof claims.e !== "number" || claims.e <= (options.now ?? Date.now)()) return null;
    return { sessionId: claims.s, participantId: claims.p };
  } catch {
    return null;
  }
}

/** Pulls the bearer token off a request. Nothing else is accepted, so no form post can carry one. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value.trim() || null;
}

/** The default verifier the routes use: a bearer token signed by this server. */
export async function participantFromRequest(
  request: Request,
): Promise<VerifiedParticipant | null> {
  return verifyParticipantToken(bearerToken(request));
}
