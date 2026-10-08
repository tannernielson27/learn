/**
 * A class's join code (#356): eight characters a student types to join, as well as the invite
 * link. Pure: no React, no Next, no Supabase — the rules the database enforces, said once here.
 *
 * The alphabet leaves out 0, O, 1, I and L, so nothing written on a board can be read as anything
 * else. It is 31 characters; the database's generator throws away the bytes that would bias it.
 * Keep it in step with `supabase/migrations/20261006010000_class_join_code.sql`.
 *
 * A code is shown as two groups of four joined by a hyphen (`ABCD-EFGH`), which a live session's
 * two groups of three with a space (`ABC DEF`) cannot be mistaken for.
 */
export const CLASS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const CLASS_CODE_LENGTH = 8;

const SPACES_AND_HYPHENS = /[\s-]/g;
const IN_ALPHABET = new RegExp(`^[${CLASS_CODE_ALPHABET}]{${CLASS_CODE_LENGTH}}$`);

/**
 * What the person typed, as the database matches it: case is forgiven, and so are spaces and
 * hyphens. `public.join_class_by_code` does the same, so this is a convenience, not the guard.
 */
export function normalizeClassCode(typed: string): string {
  return typed.replace(SPACES_AND_HYPHENS, "").toUpperCase();
}

/** Whether a normalized code could name a class at all. It says nothing about whether one does. */
export function isClassCode(value: string): boolean {
  return IN_ALPHABET.test(value);
}

/** For reading aloud and writing on the board: `ABCD-EFGH`. Anything else is shown as given. */
export function formatClassCode(code: string): string {
  const normalized = normalizeClassCode(code);
  if (!isClassCode(normalized)) return code;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}
