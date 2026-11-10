/**
 * HMAC-signed tokens for the device gate's two cookies. Web Crypto only, so the same code runs in
 * the proxy and in route handlers. A token is `<payload>.<signature>`, both base64url; the payload
 * is JSON with a kind, so a challenge can never be replayed as a session or the other way round.
 */

export interface SessionPayload {
  readonly k: "session";
  /** The device's id in private.device_gate_devices. */
  readonly d: string;
  /** Expiry, seconds since the epoch. */
  readonly exp: number;
}

export interface ChallengePayload {
  readonly k: "challenge";
  readonly purpose: "register" | "unlock";
  /** The WebAuthn challenge, base64url. */
  readonly ch: string;
  /** Registration only: the name the person gave the device. */
  readonly name?: string;
  /** Registration only: the sha-256 of the invite token, when an invite was used. */
  readonly invite?: string;
  readonly exp: number;
}

export type GatePayload = SessionPayload | ChallengePayload;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signToken(payload: GatePayload, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret, "sign");
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

function isSession(
  value: Record<string, unknown>,
): value is Record<string, unknown> & SessionPayload {
  return value.k === "session" && typeof value.d === "string" && value.d.length > 0;
}

function isChallenge(
  value: Record<string, unknown>,
): value is Record<string, unknown> & ChallengePayload {
  return (
    value.k === "challenge" &&
    (value.purpose === "register" || value.purpose === "unlock") &&
    typeof value.ch === "string" &&
    value.ch.length > 0 &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.invite === undefined || typeof value.invite === "string")
  );
}

/**
 * The payload when the signature is good, the kind is the one asked for and it has not expired;
 * otherwise null. `crypto.subtle.verify` compares the signature in constant time.
 */
export async function verifyToken<K extends GatePayload["k"]>(
  token: string | null | undefined,
  secret: string,
  kind: K,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<Extract<GatePayload, { k: K }> | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signatureText] = parts;
  const signature = fromBase64Url(signatureText);
  if (!body || !signature) return null;

  const key = await hmacKey(secret, "verify");
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature as Uint8Array<ArrayBuffer>,
    encoder.encode(body),
  );
  if (!valid) return null;

  const bytes = fromBase64Url(body);
  if (!bytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Record<string, unknown>;
  if (typeof value.exp !== "number" || value.exp <= nowSeconds) return null;
  if (value.k !== kind) return null;
  if (kind === "session" ? !isSession(value) : !isChallenge(value)) return null;
  return value as unknown as Extract<GatePayload, { k: K }>;
}

/** sha-256 of a string, hex. Invite tokens are stored only as this. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time that depends only on their length, via their digests. */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

/** A random token for an invite link: 32 bytes, base64url. */
export function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
