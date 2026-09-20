/**
 * The name a student types on the way into a room, and the only thing the rest of the class ever
 * sees of them. Pure: no React, no Next, no Supabase, so the form can clean a name as it is typed
 * and the server can clean the same name again before it is stored.
 *
 * #130 left Unicode to this story on purpose. The decisions, and why:
 *
 * **NFKC, not NFC.** Compatibility normalization folds fullwidth, mathematical-alphanumeric and
 * circled characters onto their plain forms, so a name built out of them stops being a way to sit
 * in a room wearing somebody else's title. It costs the folding of ligatures and superscripts,
 * which no one's name needs. What it does NOT solve is a homoglyph from another script: Cyrillic
 * "a" is a different letter and stays one. Telling those apart needs a confusables table and a
 * policy about mixed scripts, and belongs to whichever story gives a host the power to rename or
 * remove a participant. It is not this one.
 *
 * **Invisible formatting characters are removed, joiners are kept.** A bidi override or an
 * unterminated embedding does not just style the name: it reorders the text printed beside it, so
 * a name can rewrite a roster line it is not part of. Escaping cannot help with that, because the
 * characters are not markup. Zero-width joiner and non-joiner are left alone — they are ordinary
 * spelling in Persian, Devanagari and elsewhere, and in emoji sequences.
 *
 * **Whitespace is collapsed and trimmed**, so a name cannot be padded into a column of its own or
 * made to look blank.
 *
 * **The cap is counted in code points**, not UTF-16 units, so a name is never cut through the
 * middle of a character; and an over-long name is refused rather than silently shortened, because
 * being quietly renamed in front of a class is worse than being asked to try again.
 *
 * Escaping itself is not done here. React escapes every string it renders, and nothing in the app
 * puts a display name through raw HTML; this module removes the characters that escaping would
 * not have helped with.
 */

export const DISPLAY_NAME_MAX_LENGTH = 32;

export const DISPLAY_NAME_EMPTY = "Enter a display name so the class can see who answered.";

export const DISPLAY_NAME_TOO_LONG = `Display names are ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`;

export type DisplayNameResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Invisible formatting, one code point at a time: soft hyphen, Mongolian vowel separator,
 * zero-width space, the left- and right-to-left marks, the line and paragraph separators, and the
 * byte order mark.
 *
 * U+200C ZERO WIDTH NON-JOINER and U+200D ZERO WIDTH JOINER are deliberately absent: they are
 * spelling, not formatting.
 */
const INVISIBLE = new Set([0x00ad, 0x180e, 0x200b, 0x200e, 0x200f, 0x2028, 0x2029, 0xfeff]);

/**
 * Runs of the same thing: the bidi embeddings and overrides (U+202A to U+202E), then the word
 * joiner, the invisible operators, the bidi isolates and the deprecated formatting block
 * (U+2060 to U+206F).
 */
const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x202a, 0x202e],
  [0x2060, 0x206f],
];

/**
 * Matched by code point rather than by a character class, so this file's own source carries no
 * invisible characters — a regular expression full of them cannot be reviewed.
 */
function isRemoved(codePoint: number): boolean {
  // Tab, the two newlines, vertical tab, form feed and the C1 next-line are control characters,
  // but they are whitespace first: collapsed to a space below rather than deleted, so a name
  // pasted out of a spreadsheet keeps its word break instead of running together.
  if (codePoint >= 0x09 && codePoint <= 0x0d) return false;
  if (codePoint === 0x85) return false;
  // Every other C0 and C1 control character, including the ones a terminal would act on.
  if (codePoint <= 0x1f) return true;
  if (codePoint >= 0x7f && codePoint <= 0x9f) return true;
  if (INVISIBLE.has(codePoint)) return true;
  return INVISIBLE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

const WHITESPACE_RUN = /\s+/g;

/**
 * What the person typed, as it will be stored and shown. Never throws and never refuses: it
 * returns what is left, which may be the empty string. `parseDisplayName` is what decides whether
 * that is a name.
 */
export function cleanDisplayName(typed: string): string {
  const kept = [...typed.normalize("NFKC")]
    .filter((character) => !isRemoved(character.codePointAt(0) ?? 0))
    .join("");
  return kept.replace(WHITESPACE_RUN, " ").trim();
}

/** How long a name is to a reader: characters, not UTF-16 units. */
export function displayNameLength(value: string): number {
  return [...value].length;
}

/**
 * Reads a display name off a form. Takes `unknown` because `FormData.get` returns a string, a
 * File or null, and neither of the other two is a name.
 */
export function parseDisplayName(value: unknown): DisplayNameResult {
  if (typeof value !== "string") return { ok: false, error: DISPLAY_NAME_EMPTY };

  const cleaned = cleanDisplayName(value);
  if (cleaned === "") return { ok: false, error: DISPLAY_NAME_EMPTY };
  if (displayNameLength(cleaned) > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, error: DISPLAY_NAME_TOO_LONG };
  }
  return { ok: true, value: cleaned };
}
