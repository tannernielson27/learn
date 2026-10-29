// The token and its digest for a beta pass (#520). The same scheme as a workspace invitation:
// 24 bytes from the operating system's CSPRNG, base64url, 32 characters, 192 bits; and the digest
// the database computes for it, private.org_invite_token_hash: SHA-256 of the UTF-8 token, as 64
// lower-case hex digits. Only the digest is sent to the database.
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_BYTES = 24;
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32}$/;

/** A fresh token. */
export function newToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** The digest the database stores and looks a token up by. */
export function tokenHash(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * The origin links start with, from `SITE_URL`, the variable the app's emailed links use
 * (`canonicalSiteOrigin`). https, or http on this machine only, for local development. Null for
 * anything else, so a typo never becomes a link.
 */
export function linkOrigin(value) {
  const trimmed = (value ?? "").trim();
  if (!URL.canParse(trimmed)) return null;
  const url = new URL(trimmed);
  if (url.protocol === "https:") return url.origin;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return url.protocol === "http:" && local ? url.origin : null;
}

/** `<origin>/b/<token>`. */
export function passLink(origin, token) {
  return `${origin}/b/${token}`;
}
