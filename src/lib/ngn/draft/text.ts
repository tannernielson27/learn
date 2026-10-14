/**
 * Text clean-up for AI drafts (#337). The model copies a question word for word, answer marks
 * included; these helpers normalize what it copied and read the marks, without rewording anything.
 */

const SMART_QUOTES: [RegExp, string][] = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
];

/** Check marks that sources use for a key. `*` is handled separately: it is also markdown. */
const CHECK_MARK = /^[✅✔✓☑]️?/;
const CHECK_MARK_END = /[✅✔✓☑]️?$/;
const CHECK_MARK_ANYWHERE = /[✅✔✓☑]️?/g;

function straightenQuotes(value: string): string {
  return SMART_QUOTES.reduce((text, [pattern, plain]) => text.replace(pattern, plain), value);
}

/** One line of text: smart quotes straightened, every run of whitespace one space, trimmed. */
export function normalizeLine(value: string): string {
  return straightenQuotes(value).replace(/\s+/g, " ").trim();
}

/**
 * Markdown that may span paragraphs (a stem, a rationale): line breaks are kept, spaces within a
 * line collapse, and more than one blank line becomes one.
 */
export function normalizeMarkdown(value: string): string {
  return straightenQuotes(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const countStars = (text: string): number => (text.match(/\*/g) ?? []).length;

/**
 * Takes one answer mark off the start or end of `text`, if there is one. A `*` counts as a mark
 * only when the `*`s left behind pair up, so markdown emphasis such as `*not*` is left alone.
 */
function stripOneMarker(text: string): string | undefined {
  if (CHECK_MARK.test(text)) return text.replace(CHECK_MARK, "").trim();
  if (CHECK_MARK_END.test(text)) return text.replace(CHECK_MARK_END, "").trim();
  if (text.endsWith("*")) {
    const rest = text.slice(0, -1).trim();
    if (countStars(rest) % 2 === 0) return rest;
  }
  if (text.startsWith("*")) {
    const rest = text.slice(1).trim();
    if (countStars(rest) % 2 === 0) return rest;
  }
  return undefined;
}

export interface MarkedText {
  /** The text with its marks removed and its whitespace and quotes normalized. */
  text: string;
  /** Whether the source marked it as (part of) the answer. */
  marked: boolean;
}

/**
 * Reads an option, row or cell as the model copied it: `* Text`, `Text*`, `Text *`, `✅ Text`
 * and the like are marked; the text that remains is otherwise kept word for word.
 */
export function readMarked(raw: string): MarkedText {
  let text = normalizeLine(raw);
  let marked = false;
  for (let stripped = stripOneMarker(text); stripped !== undefined;) {
    marked = true;
    text = stripped;
    stripped = stripOneMarker(text);
  }
  return { text, marked };
}

/** A matrix cell is marked by a `*`, a check mark or a lone `X`; anything else is not a key. */
export function isMarkedCell(raw: string): boolean {
  const cell = normalizeLine(raw);
  if (cell === "") return false;
  if (/^[xX]$/.test(cell)) return true;
  return readMarked(cell).marked;
}

/** The letter sources print before the option at `index`: A, B, C… */
export const letterOf = (index: number): string => String.fromCharCode(65 + index);

const ANSWER_PREFIX =
  /^(?:the\s+)?(?:correct\s+)?(?:answers?|keys?|order|sequence|response)\s*(?:is|are)?\s*[:.\-–]?\s*/i;

function parseLetterTokens(answer: string, count: number): number[] | undefined {
  const tokens = answer
    .split(/\s*(?:,|;|\/|&|\band\b|→|->|>|\s)\s*/i)
    .map((token) => token.trim())
    .filter((token) => token !== "");
  if (tokens.length === 0) return undefined;
  const indices: number[] = [];
  for (const token of tokens) {
    const letter = /^\(?([A-Za-z])[).]?$/.exec(token);
    const number = /^\(?(\d{1,2})[).]?$/.exec(token);
    const index = letter
      ? letter[1].toUpperCase().charCodeAt(0) - 65
      : number
        ? Number(number[1]) - 1
        : -1;
    if (index < 0 || index >= count) return undefined;
    indices.push(index);
  }
  return indices;
}

const comparable = (text: string): string =>
  readMarked(text)
    .text.toLowerCase()
    .replace(/[.;:]+$/, "");

/**
 * Reads a key printed apart from the options ("Answer: ✅ B.", "A, C, D", "C → A → D → B", or the
 * option's own words) into option positions, in the order given. `undefined` when the text names
 * something that is not one of `labels`: the caller flags it rather than guessing.
 */
export function parseAnswer(answer: string, labels: readonly string[]): number[] | undefined {
  const cleaned = normalizeLine(answer)
    .replace(CHECK_MARK_ANYWHERE, " ")
    .replace(ANSWER_PREFIX, "")
    .replace(/[.]+$/, "")
    .trim();
  if (cleaned === "") return undefined;

  const byLetter = parseLetterTokens(cleaned, labels.length);
  if (byLetter) return byLetter;

  const wanted = labels.map(comparable);
  const whole = wanted.indexOf(comparable(cleaned));
  if (whole >= 0) return [whole];

  const parts = cleaned.split(/\s*(?:;|\n|→|->)\s*/).filter((part) => part !== "");
  const indices = parts.map((part) => wanted.indexOf(comparable(part)));
  return parts.length > 1 && indices.every((index) => index >= 0) ? indices : undefined;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const SELECT_ALL = /\ball\s+that\s+apply\b/i;
const SELECT_COUNT =
  /\b(?:select|choose|pick|identify|which|what|mark|indicate)\s+(?:the\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;

/**
 * How many options a select-N question asks for, read from its own words ("Which 4 findings…",
 * "Select the 3 priority interventions."). `undefined` for select all that apply, or when no
 * number is stated.
 */
export function statedSelectCount(...texts: (string | undefined)[]): number | undefined {
  const present = texts.filter((text): text is string => text !== undefined);
  if (present.some((text) => SELECT_ALL.test(text))) return undefined;
  for (const text of present) {
    const match = SELECT_COUNT.exec(normalizeLine(text));
    if (match) {
      const raw = match[1].toLowerCase();
      return NUMBER_WORDS[raw] ?? Number(raw);
    }
  }
  return undefined;
}

/** A scoring rule as a source states it, read into the engine's terms. */
export type StatedRule = "zero_one" | "plus_minus" | "rationale" | "position";

/**
 * Reads "Scoring Rule: +/-", "0/1", "Rationale", "1 point per correct position" and similar.
 * `undefined` when the words name no rule this app knows.
 */
export function parseScoringRule(stated: string): StatedRule | undefined {
  const text = normalizeLine(stated).toLowerCase();
  if (/position/.test(text)) return "position";
  if (/\+\s*\/\s*[-–−]|plus\s*\/?\s*minus/.test(text)) return "plus_minus";
  if (/\b0\s*\/\s*1\b|zero\s*[/-]?\s*one|dichotomous/.test(text)) return "zero_one";
  if (/rationale|dyad|triad/.test(text)) return "rationale";
  return undefined;
}
