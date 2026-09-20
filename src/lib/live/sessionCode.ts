/**
 * The join code a class types in. Pure: no React, no Next, no Supabase — the same rules the
 * database enforces, said once here so a form can check a code before spending a round trip.
 *
 * The alphabet leaves out O, 0, I and 1, so nothing on a projector can be read as anything else.
 * It is exactly 32 characters, which is also what lets the generator take a random byte modulo 32
 * without bias. Keep it in step with the check constraint in the live-sessions migration.
 */
export const SESSION_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const SESSION_CODE_LENGTH = 6;

const NOT_ALPHANUMERIC = /[^0-9a-z]/gi;
const IN_ALPHABET = new RegExp(`^[${SESSION_CODE_ALPHABET}]{${SESSION_CODE_LENGTH}}$`);

/**
 * What the person typed, as the database stores it. Case is forgiven and so are the spaces and
 * hyphens people put between the halves; nothing else is, because no other character can be part
 * of a code in the first place.
 */
export function normalizeSessionCode(typed: string): string {
  return typed.replace(NOT_ALPHANUMERIC, "").toUpperCase();
}

/** Whether a normalized code could name a session at all. It says nothing about whether one does. */
export function isSessionCode(value: string): boolean {
  return IN_ALPHABET.test(value);
}

/** For reading aloud and copying down: two groups of three. */
export function formatSessionCode(code: string): string {
  const normalized = normalizeSessionCode(code);
  if (!isSessionCode(normalized)) return normalized;
  return `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
}
