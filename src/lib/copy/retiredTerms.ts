/**
 * The words docs/glossary.md retired from the interface, and a check that finds them in rendered
 * HTML. The rename stories (#412 to #416) run it over each screen they cover: visible text, the
 * attributes a person hears or sees (`aria-label`, `title`, `placeholder`, `alt`) and page titles.
 * Markup that is not read, such as class names, ids, hrefs and scripts, is left out, so a route
 * like `/author/banks/…` or a `name="item"` field never counts.
 */

export interface RetiredTerm {
  /** The glossary word that takes its place, for the failure message. */
  readonly say: string;
  readonly pattern: RegExp;
}

export const RETIRED_TERMS: readonly RetiredTerm[] = [
  // "Word bank" is the NCLEX name for a drag-and-drop question's choices, and the one exception.
  { say: "quiz", pattern: /(?<!\bword )\bbanks?\b/i },
  { say: "question", pattern: /\bitems?\b/i },
  { say: "teacher", pattern: /\binstructors?\b/i },
  { say: "teacher or library", pattern: /\bauthor(?:s|ed|ing)?\b/i },
  { say: "teacher or colleague", pattern: /\bmembers?\b/i },
  { say: "the person who started this workspace", pattern: /\bfounders?\b/i },
  { say: "workspace", pattern: /\b(?:organi[sz]ations?|orgs?)\b/i },
  { say: "Not in a folder", pattern: /\bunfiled\b/i },
  { say: "All quizzes", pattern: /\ball content\b/i },
  // "Live session" in full; "in this session" is the one approved short form.
  { say: "live session", pattern: /(?<!\blive )(?<!\bin this )\bsessions?\b/i },
  { say: "live session", pattern: /\b(?:rooms?|console|hosts?)\b/i },
  { say: "clinical judgment step", pattern: /\bCJMM\b/ },
  { say: "patient record", pattern: /\b(?:EHR|charts?)\b/i },
  { say: "assignment", pattern: /\b(?:take-home work|graded work|homework)\b/i },
  { say: "practice", pattern: /\bpractice runs?\b/i },
  { say: "Start", pattern: /\b(?:launch|go live)\b/i },
  { say: "Start a live session", pattern: /\brun a\b/i },
  {
    say: "New, then Create",
    pattern: /\bmake an? (?:quiz|question|case study|class|folder)\b/i,
  },
  {
    say: "Archive",
    pattern: /\bdelet\w* (?:a |an |the |this |that )?(?:quiz|question|case study|class)\b/i,
  },
];

const READ_ATTRIBUTES = /\s(?:aria-label|title|placeholder|alt)="([^"]*)"/gi;

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decode(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, (entity) => ENTITIES[entity] ?? " ");
}

/**
 * What a person reads or hears from a piece of rendered HTML: its text, then the value of each
 * read attribute, one entry each. Scripts, styles and tags themselves are dropped.
 */
export function readableStrings(html: string): string[] {
  const body = html.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ");
  const attributes = [...body.matchAll(READ_ATTRIBUTES)].map((match) => decode(match[1] ?? ""));
  const text = decode(body.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return [text, ...attributes].filter((entry) => entry.length > 0);
}

export interface RetiredTermHit {
  readonly found: string;
  readonly say: string;
  /** The words around it, to find it on the screen. */
  readonly context: string;
}

/** Every retired term in the given strings (rendered HTML, or a page title). Empty when clean. */
export function findRetiredTerms(...sources: readonly string[]): RetiredTermHit[] {
  const hits: RetiredTermHit[] = [];
  for (const entry of sources.flatMap((source) => readableStrings(source))) {
    for (const term of RETIRED_TERMS) {
      const all = new RegExp(term.pattern.source, `${term.pattern.flags.replace("g", "")}g`);
      for (const match of entry.matchAll(all)) {
        const at = match.index ?? 0;
        hits.push({
          found: match[0],
          say: term.say,
          context: entry.slice(Math.max(0, at - 30), at + match[0].length + 30),
        });
      }
    }
  }
  return hits;
}

/** A closed `<details>` shows its summary and nothing else. Not written for nested ones. */
function withoutClosedDetails(html: string): string {
  return html.replace(
    /<details(?![^>]*\sopen[\s>=])[^>]*>([\s\S]*?)<\/details>/gi,
    (_all, inside: string) => /<summary[\s>][\s\S]*?<\/summary>/i.exec(inside)?.[0] ?? " ",
  );
}

/**
 * How many words a person sees on the screen as it first draws: the text of the HTML, without the
 * read attributes and without what is folded away, which is the choices inside a `<select>`, the
 * body of a closed `<details>` and a `<dialog>` that is not open. Text for screen readers only is
 * still counted, since the markup alone does not say what is hidden.
 */
export function visibleWordCount(html: string): number {
  const shown = withoutClosedDetails(html)
    .replace(/<dialog(?![^>]*\sopen[\s>=])[^>]*>[\s\S]*?<\/dialog>/gi, " ")
    .replace(/<option[\s>][\s\S]*?<\/option>/gi, " ")
    .replace(/\s(?:aria-label|title|placeholder|alt)="[^"]*"/gi, "");
  const [text] = readableStrings(shown);
  return text ? text.split(" ").filter((word) => /[\p{L}\p{N}]/u.test(word)).length : 0;
}
