/**
 * The check behind the rename stories (#412 to #416): the words `docs/glossary.md` retired must not
 * come back in anything a person reads. Tests hand it a page's rendered HTML or an email's parts
 * and get back every retired word it found, so a failure names the word and where it sits.
 *
 * It reads what a person reads or hears: text, and the `aria-label`, `alt`, `title` and
 * `placeholder` attributes. Addresses, ids and class names are skipped, because routes and code
 * names keep their old words on purpose (`/help/items`, `/author`).
 *
 * Pure: no DOM, so it runs in the node tests as well as the jsdom ones.
 */

/** Glossary phrases that hold a retired word and are still right. Each is set aside before matching. */
const KEPT: readonly RegExp[] = [
  // The NCLEX name for a drag-and-drop question's list of choices.
  /\bword banks?\b/g,
  /\blive sessions?\b/g,
  /\bin this session\b/g,
  /\bpatient records?\b/g,
  // Clinical wording inside a sample question, not a place students are in.
  /\broom air\b/g,
];

export interface RetiredTerm {
  /** The retired word, as the glossary lists it. */
  term: string;
  /** What the glossary says instead. */
  use: string;
  pattern: RegExp;
}

const NOUNS =
  "quiz|quizzes|class|classes|question|questions|case study|case studies|folder|folders";

export const RETIRED_TERMS: readonly RetiredTerm[] = [
  { term: "bank", use: "quiz", pattern: /\b(?:item |question |practice )?banks?\b/ },
  { term: "item", use: "question", pattern: /\bitems?\b/ },
  { term: "instructor", use: "teacher", pattern: /\binstructors?\b/ },
  { term: "author", use: "teacher, or library", pattern: /\bauthor(?:s|ed|ing)?\b/ },
  { term: "session alone", use: "live session, or join code", pattern: /\bsessions?\b/ },
  { term: "room", use: "live session, or in this session", pattern: /\brooms?\b/ },
  { term: "console", use: "live session", pattern: /\bconsole\b/ },
  { term: "host", use: "live session", pattern: /\bhost(?:s|ed|ing)?\b/ },
  { term: "member", use: "teacher, or colleague", pattern: /\bmembers?\b/ },
  { term: "founder", use: "the person who started this workspace", pattern: /\bfounders?\b/ },
  { term: "organization", use: "workspace", pattern: /\b(?:organi[sz]ations?|orgs?)\b/ },
  { term: "CJMM", use: "clinical judgment step", pattern: /\bcjmm\b/ },
  { term: "EHR", use: "patient record", pattern: /\behr\b/ },
  { term: "chart", use: "patient record", pattern: /\bcharts?\b/ },
  { term: "record alone", use: "patient record", pattern: /\brecords?\b/ },
  { term: "unfiled", use: "Not in a folder", pattern: /\bunfiled\b/ },
  { term: "all content", use: "All quizzes", pattern: /\ball content\b/ },
  {
    term: "take-home work",
    use: "assignment",
    pattern: /\b(?:take-home (?:work|assignments?)|graded work|homework|assign(?:ed)? work)\b/,
  },
  { term: "practice run", use: "practice", pattern: /\bpractice runs?\b/ },
  { term: "launch", use: "start", pattern: /\blaunch(?:es|ed|ing)?\b/ },
  {
    term: "run, for a live session",
    use: "start a live session",
    pattern: /\b(?:run|runs|running|ran)\b(?: \w+){0,2} (?:live\b|‹live›)|\bgo(?:es)? live\b/,
  },
  {
    term: "make, for something a teacher creates",
    use: "New, then Create",
    pattern: new RegExp(
      `\\b(?:make|makes|making|made) (?:(?:a|an|your|the|one|new) ){0,2}(?:${NOUNS})\\b`,
    ),
  },
];

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

function decode(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|nbsp|#39|#x27);/g, (entity) => ENTITIES[entity] ?? " ");
}

const READ_ATTRIBUTES = /\s(?:aria-label|alt|title|placeholder)="([^"]*)"/g;

/** What a screen reader is given beyond the text: labels, alt text, titles and placeholders. */
export function spokenAttributes(html: string): string[] {
  return [...html.matchAll(READ_ATTRIBUTES)].map((match) => decode(match[1] ?? "").trim());
}

/** The text of an HTML string, with scripts, styles and tags gone and one space between words. */
export function visibleText(html: string): string {
  const text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ");
  return decode(text).replace(/\s+/g, " ").trim();
}

/** Everything in an HTML string that a person reads or hears. */
export function readText(html: string): string {
  return [visibleText(html), ...spokenAttributes(html)].join(" \n ");
}

/** Words in a text: runs of non-space characters that hold a letter or a digit. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function normalize(text: string): string {
  const flat = text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ");
  return KEPT.reduce(
    (rest, kept) =>
      rest.replace(kept, (phrase) => (phrase.startsWith("live") ? "‹live›" : "‹kept›")),
    flat,
  );
}

/**
 * Every retired word in `text`, each with the words around it. Empty when the text is clean.
 * `text` is plain text; pass HTML through `readText` first.
 */
export function findRetiredTerms(text: string): string[] {
  const flat = normalize(text);
  return RETIRED_TERMS.flatMap(({ term, use, pattern }) => {
    const match = pattern.exec(flat);
    if (!match) return [];
    const from = Math.max(0, match.index - 30);
    const around = flat.slice(from, match.index + match[0].length + 30).trim();
    return [`"${term}" (say: ${use}) in "...${around}..."`];
  });
}
