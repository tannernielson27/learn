import { z } from "zod";

export type InviteAddressResult = { ok: true; email: string } | { ok: false; error: string };

export const INVITE_ADDRESS_ERROR =
  "Enter one email address for your colleague, like name@school.edu.";

/** The longest address SMTP allows, and the longest `org_invites.email` holds. */
const ADDRESS_MAX = 254;

/**
 * Characters an address may carry by the letter of the standard and that this form refuses all
 * the same: each one is how a second recipient, a display name or a comment is written, and the
 * address is printed in an email and on the workspace page.
 */
const REFUSED = new Set(["<", ">", '"', ",", ";", "(", ")", "\\"]);

/** C0 and C1 control characters and delete: tabs and line ends included. */
function isControl(code: number): boolean {
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

function isPlain(value: string): boolean {
  for (const character of value) {
    if (REFUSED.has(character) || isControl(character.codePointAt(0) ?? 0)) return false;
  }
  return true;
}

// Checked as typed, before any trimming: a line end at either end is refused, not tidied away.
// Only ordinary spaces around the address are forgiven.
const addressSchema = z
  .string()
  .max(ADDRESS_MAX + 66)
  .refine(isPlain)
  .transform((value) => value.replace(/^ +| +$/g, "").toLowerCase())
  .pipe(z.string().min(3).max(ADDRESS_MAX).pipe(z.email()));

/**
 * Reads the invite form's one field on the server. Stricter than `create_org_invite`, which
 * checks only the shape: nothing reaches the database, the email or the page that this refuses.
 */
export function parseInviteAddress(value: unknown): InviteAddressResult {
  const parsed = addressSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: INVITE_ADDRESS_ERROR };
  return { ok: true, email: parsed.data };
}
