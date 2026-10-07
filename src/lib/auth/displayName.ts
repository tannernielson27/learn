import { z } from "zod";
import { cleanDisplayName, displayNameLength } from "@/lib/live/displayName";

/**
 * The name on an account (#358): `profiles.display_name`, which the instructor's roster and the
 * header show. The same rule serves the class invite form, the account page and, later, sign-up
 * (#361), so a name is cleaned the same way wherever it is typed.
 *
 * Cleaning is the live room's (`cleanDisplayName`): NFKC, control characters and direction
 * overrides removed, whitespace collapsed and trimmed. Escaping is React's; this removes what
 * escaping cannot help with. The cap is the column's own check, `length(display_name) <= 80`,
 * counted in characters as Postgres counts them, and a longer name is refused, never cut.
 */

export const ACCOUNT_NAME_MAX_LENGTH = 80;
export const ACCOUNT_NAME_HINT = "Your instructor sees this on the class roster.";
export const ACCOUNT_NAME_EMPTY = "Enter your name.";
export const ACCOUNT_NAME_TOO_LONG = `Use ${ACCOUNT_NAME_MAX_LENGTH} characters or fewer for your name.`;

/**
 * U+0085, the C1 next-line. `cleanDisplayName` keeps it as whitespace, but JavaScript's `\s` does
 * not collapse it, so it would survive into the stored name. Here it becomes the space it means.
 */
const NEXT_LINE = /\u0085/g;

/** A form value in, the name as it will be stored out. Anything but text is no name. */
export const displayNameRule = z
  .string(ACCOUNT_NAME_EMPTY)
  .transform((typed) => cleanDisplayName(typed.replace(NEXT_LINE, " ")))
  .pipe(
    z
      .string()
      .min(1, ACCOUNT_NAME_EMPTY)
      .refine((name) => displayNameLength(name) <= ACCOUNT_NAME_MAX_LENGTH, ACCOUNT_NAME_TOO_LONG),
  );

export type AccountNameResult = { ok: true; name: string } | { ok: false; error: string };

/** `displayNameRule` for a Server Function: the name, or the one message to show. */
export function parseAccountName(value: unknown): AccountNameResult {
  const parsed = displayNameRule.safeParse(value);
  if (parsed.success) return { ok: true, name: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? ACCOUNT_NAME_EMPTY };
}

/** What the header shows for whoever is signed in: their name when they have one. */
export function shownName(person: { displayName: string | null; email: string }): string {
  const name = person.displayName?.trim();
  return name ? name : person.email;
}
