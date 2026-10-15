/**
 * Comparing what the model copied with the source (#342). Markup, punctuation, case and spacing
 * are ignored, so "**A.** Assess the airway" matches "A. Assess the airway"; the words and their
 * order are not, so a sentence the model wrote itself does not match anything.
 */

/** Unescapes markdown backslashes, then keeps letters and digits, lower-case, one space apart. */
export function normalizePassage(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\\(.)/g, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The first `words` words of a passage, normalized: how one question is told from another. */
export function openingKey(text: string, words = 12): string {
  return normalizePassage(text).split(" ").filter(Boolean).slice(0, words).join(" ");
}

/**
 * Whether `passage` appears in `source`. An excerpt is matched by its opening (`words`); an answer
 * section by every word, since it may carry a key.
 */
export function containsPassage(source: string, passage: string, words = Infinity): boolean {
  const wanted = Number.isFinite(words) ? openingKey(passage, words) : normalizePassage(passage);
  if (!wanted) return false;
  return ` ${normalizePassage(source)} `.includes(` ${wanted} `);
}
