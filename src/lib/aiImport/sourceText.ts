/**
 * Comparing what the model copied with the source (#342). Markup, punctuation, case and spacing
 * are ignored, so "**A.** Assess the airway" matches "A. Assess the airway"; the words and their
 * order are not, so a sentence the model wrote itself does not match anything.
 *
 * Markup means every mark the .docx converter writes (#592, `files/docx/format.ts` and
 * `DOCX_MARKUP`). Most are punctuation and fall away by themselves, but some are spelled with
 * letters: `<u>first</u>` used to read as "u first u", a cell break as "br", and a highlight
 * added the word "yellow". A model that copied the words without the tags was then told its
 * question was not in the document. Those marks are taken out of both sides before comparing.
 */

/**
 * The converter's marks that hold letters or digits: underline and line-break tags, the colour
 * after a highlighted or coloured stretch, a shaded cell or paragraph, and the stand-ins for a
 * picture, a text box and an unreadable character.
 */
const LETTERED_MARKUP =
  /<\/?u>|<br\s*\/?>|==\{[^{}\n]{1,40}\}|\{shaded\s+#[0-9A-Fa-f]{6}\}|\[image\]|\[\/?text box\]|\[symbol\]/gi;

/** Text an author crossed out, as the converter writes it. */
const STRUCK = /~~[^~\n]+~~/g;

/** A caret between two characters is how a raised number is typed: 10^3 is 10³. */
const CARET = /(?<=[\p{L}\p{N}])\^(?=[\p{L}\p{N}])/gu;

/** Where the lettered markup sits in `source`, as `[start, end)` pairs in order. */
export function markupSpans(source: string, struckToo = false): [number, number][] {
  const spans = [...source.matchAll(LETTERED_MARKUP)].map((match): [number, number] => [
    match.index,
    match.index + match[0].length,
  ]);
  if (!struckToo) return spans;
  const struck = [...source.matchAll(STRUCK)].map((match): [number, number] => [
    match.index,
    match.index + match[0].length,
  ]);
  return [...spans, ...struck].sort((a, b) => a[0] - b[0]);
}

/** `text` with the struck-out stretches taken out, as a reader who skips them reads it. */
export const withoutStruck = (text: string): string => text.replace(STRUCK, " ");

/** Whether `text` holds any struck-out stretch. */
export const hasStruck = (text: string): boolean => text.search(STRUCK) >= 0;

/**
 * Takes out the converter's lettered marks and markdown backslashes, then keeps letters and
 * digits, lower-case, one space apart.
 */
export function normalizePassage(text: string): string {
  return text
    .replace(LETTERED_MARKUP, " ")
    .normalize("NFKC")
    .replace(/\\(.)/g, "$1")
    .replace(CARET, "")
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
 *
 * Struck-out text is tried both ways: the model is told it is not part of the question, so it
 * may leave it out of what it copies, or it may copy it with the rest.
 */
export function containsPassage(source: string, passage: string, words = Infinity): boolean {
  const wanted = Number.isFinite(words) ? openingKey(passage, words) : normalizePassage(passage);
  if (!wanted) return false;
  if (` ${normalizePassage(source)} `.includes(` ${wanted} `)) return true;
  if (!hasStruck(source) && !hasStruck(passage)) return false;
  const skipping = Number.isFinite(words)
    ? openingKey(withoutStruck(passage), words)
    : normalizePassage(withoutStruck(passage));
  return (
    skipping !== "" && ` ${normalizePassage(withoutStruck(source))} `.includes(` ${skipping} `)
  );
}
