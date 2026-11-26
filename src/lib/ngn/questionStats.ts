/**
 * Question statistics (#615): how hard a question is, how well it separates the students who did
 * well from those who did not, how its marks split, which answers were chosen, and the flags a
 * teacher should look at. One tested set of rules, so every screen shows the same figure. Pure:
 * no React, no Next, no Supabase, and nothing that reads the database.
 *
 * No published method was found for these figures on partial-credit NGN questions, so the
 * definitions are ours (#615):
 *
 * - **Share**: `points / maxPoints` for one answer. A mark whose score the engine could not have
 *   given (not finite, negative, more than was on offer, or out of nothing) is set aside, counted
 *   in `unusableAnswers`, and never divided by.
 * - **Current key**: an answer counts only if it was scored with the question's key and scoring as
 *   they are now (`scoredWithCurrentKey`). The rest are counted in `earlierAnswers` and left out of
 *   every figure, the rest-of-activity shares included. A changed key restarts the figures; a
 *   changed stem, option text or rationale does not.
 * - **One answer per answerer per question per use.** A use is one live session or one
 *   assignment; answerer keys are opaque and only mean something inside their use. If a reader
 *   hands over two marks for the same answerer, question and use, one is kept, by a rule that does
 *   not depend on their order: a current-key mark before an earlier-key one, then the higher share,
 *   then the larger maxPoints. The others are counted in `duplicateAnswers`.
 * - **How hard**: the mean share over the question's answers, each counting once. Partial credit
 *   counts as partial. Higher is easier.
 * - **Split**: full marks (share 1), no marks (share 0), and partial marks (everything between).
 * - **Separation**: per use, the Pearson correlation between each answerer's share on this question
 *   and their share on the rest of that use: total points over total maxPoints on every *other*
 *   question in the quiz the same answerer answered in that use (a corrected item-total
 *   correlation). An answerer with no other usable answer in the use is left out of it. A use adds
 *   nothing unless it has `MIN_ANSWERS_PER_USE` answerers with both shares and both columns vary.
 *   Uses are combined as a mean weighted by those answerer counts. There is no figure before the
 *   question has `MIN_ANSWERS_FOR_FIGURES` current-key answers, none when every answer scored the
 *   same, and none when no use qualified; each of those is a state, never NaN.
 * - **Which answers were chosen**: `distributionFor` from `src/lib/live/results`, over one
 *   question's current-key answers with their responses, deduplicated as above.
 * - **Flags**: only from `MIN_ANSWERS_FOR_FIGURES` current-key answers on; see `flagsFor`.
 *
 * Every computation runs over the marks sorted by use, answerer and question, so answers in any
 * order give the same result to the last bit.
 */
import { distributionFor, type ChoiceCount, type Distribution } from "@/lib/live/results";
import type { Item } from "./schemas";

/** Where an answer was given: a live session or an assignment. */
export const USE_KINDS = ["live", "assignment"] as const;
export type UseKind = (typeof USE_KINDS)[number];

/** Owner decision (#615, decision 2): no separation figure and no flag before this many answers. */
export const MIN_ANSWERS_FOR_FIGURES = 20;
/** #615: a use with fewer answerers than this (with a rest-of-activity share) adds nothing. */
export const MIN_ANSWERS_PER_USE = 5;

/** `too_easy` when how hard is this or more. */
export const TOO_EASY_FROM = 0.9;
/** `too_hard` when how hard is this or less. */
export const TOO_HARD_UP_TO = 0.3;
/** `does_not_separate` when separation is under this. */
export const DOES_NOT_SEPARATE_BELOW = 0.15;
/** `separates_backwards` when separation is under this. */
export const SEPARATES_BACKWARDS_BELOW = 0;

/** Every flag, in the order a result lists them. `wrong_answer_ahead` is read off the choices. */
export const QUESTION_FLAGS = [
  "too_easy",
  "too_hard",
  "does_not_separate",
  "separates_backwards",
  "wrong_answer_ahead",
] as const;
export type QuestionFlag = (typeof QUESTION_FLAGS)[number];

/**
 * One scored answer, with no answer content: what a whole-quiz marks read returns per row.
 * `reveal` is the stored `reveal` column (`{ answerKey, rationale, scoring }`, or null for rows
 * written before it existed); only its `answerKey` and `scoring` are read.
 */
export interface QuestionMark {
  useKind: UseKind;
  useId: string;
  /** Opaque, and only unique within its use. */
  answerer: string;
  itemId: string;
  points: number;
  maxPoints: number;
  reveal: unknown;
}

/** One scored answer with what was answered: what a one-question answers read returns per row. */
export interface QuestionAnswer extends QuestionMark {
  /** The stored response, untrusted: `distributionFor` parses it and counts what it cannot read. */
  response: unknown;
}

export interface QuestionStatsInput {
  /** Every question now in the quiz, as it is now, key included. Results come back in this order. */
  items: readonly Item[];
  /** Every scored answer to those questions. Marks for any other question are ignored. */
  marks: readonly QuestionMark[];
  /** Per question id, that question's answers with responses. A question not here is `not_read`. */
  answers?: Readonly<Record<string, readonly QuestionAnswer[]>>;
}

export type HowHard = { state: "no_answers" } | { state: "measured"; value: number };

export type Separation =
  | { state: "not_enough_answers"; answers: number; needed: number }
  /** Every answer to the question scored the same share, so there is nothing to correlate. */
  | { state: "same_score" }
  /** No use had enough answerers with a rest-of-activity share, and spread in both. */
  | { state: "no_comparison" }
  | { state: "measured"; value: number; usesCounted: number; answersCounted: number };

export type Choices =
  | { state: "not_read" }
  | {
      state: "counted";
      /** Current-key answers counted, after duplicates. */
      answers: number;
      earlierAnswers: number;
      duplicateAnswers: number;
      distribution: Distribution;
    };

export type Flags =
  | { state: "not_enough_answers"; answers: number; needed: number }
  | { state: "checked"; raised: QuestionFlag[] };

export interface Split {
  full: number;
  partial: number;
  none: number;
}

export interface QuestionStats {
  itemId: string;
  /** Current-key answers counted in every figure. */
  answers: number;
  /** Uses those answers came from. */
  uses: number;
  /** Answers scored with an earlier key, left out of every figure. */
  earlierAnswers: number;
  /** Marks whose score could not be real, left out of every figure. */
  unusableAnswers: number;
  /** Extra marks for an answerer already counted on this question in the same use. */
  duplicateAnswers: number;
  howHard: HowHard;
  split: Split;
  separation: Separation;
  choices: Choices;
  flags: Flags;
}

// ---------------------------------------------------------------------------
// The key an answer was scored with
// ---------------------------------------------------------------------------

/**
 * Arrays in a key whose order is part of the key. Every other array in a key is a set of ids
 * (`correctOptionIds`, `correctSpanIds`, `actionIds`...) or a list keyed by its own `rowId` or
 * `blankId`, which every scorer matches by id. Ordered response is scored on position (docs/01
 * §2.2). A rationale triad's anchor is named by `anchorBlankId`, which the schema requires, so
 * blank order never decides one.
 */
const ORDERED_PATHS: ReadonlySet<string> = new Set(["answerKey.orderedIds"]);

/** One string per value, the same for equal keys whatever the order of their properties or sets. */
function canonical(value: unknown, path: string): string {
  if (Array.isArray(value)) {
    const parts = value.map((entry) => canonical(entry, `${path}[]`));
    if (!ORDERED_PATHS.has(path)) parts.sort();
    return `[${parts.join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry, `${path}.${key}`)}`);
    return `{${entries.join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Whether `stored` (a stored reveal, or anything holding `answerKey` and `scoring`) carries the
 * item's current key and scoring, compared structurally. The rationale is not compared: rewording
 * it changes no mark. Anything that is not such an object is not the same key.
 */
export function sameScoringKey(item: Item, stored: unknown): boolean {
  if (!isRecord(stored)) return false;
  return (
    canonical(stored.answerKey, "answerKey") === canonical(item.answerKey, "answerKey") &&
    canonical(stored.scoring, "scoring") === canonical(item.scoring, "scoring")
  );
}

/**
 * Whether an answer with this stored `reveal` was scored with the item's current key. A row with
 * no reveal (null or absent: written before the column existed, 20260928000000_scored_reveal.sql)
 * counts as current, as the reveal itself does for such rows (`withScoredReveal`). For the #616
 * adapter to reuse on any row it reads.
 */
export function scoredWithCurrentKey(item: Item, storedReveal: unknown): boolean {
  if (storedReveal === null || storedReveal === undefined) return true;
  return sameScoringKey(item, storedReveal);
}

// ---------------------------------------------------------------------------
// Settling the marks: usable, one per answerer, current key
// ---------------------------------------------------------------------------

/** A score the engine could have given, out of something: finite, 0 <= points <= maxPoints > 0. */
const isRealScore = (mark: QuestionMark): boolean =>
  Number.isFinite(mark.points) &&
  Number.isFinite(mark.maxPoints) &&
  mark.maxPoints > 0 &&
  mark.points >= 0 &&
  mark.points <= mark.maxPoints;

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A key that cannot collide: JSON of the parts, not a joined string. */
const activityOf = (mark: QuestionMark): string => JSON.stringify([mark.useKind, mark.useId]);

interface Counted<M extends QuestionMark> {
  mark: M;
  share: number;
}

interface Settled<M extends QuestionMark> {
  /** Current-key answers, one per answerer per use, sorted by use then answerer. */
  current: Counted<M>[];
  earlier: number;
  unusable: number;
  duplicates: number;
}

/** Which of two marks for the same answerer, question and use is kept: negative keeps `a`. */
function preferred<M extends QuestionMark>(
  a: Counted<M> & { isCurrent: boolean },
  b: Counted<M> & { isCurrent: boolean },
): number {
  if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
  return b.share - a.share || b.mark.maxPoints - a.mark.maxPoints;
}

function settle<M extends QuestionMark>(item: Item, marks: readonly M[]): Settled<M> {
  let unusable = 0;
  const groups = new Map<string, (Counted<M> & { isCurrent: boolean })[]>();
  for (const mark of marks) {
    if (mark.itemId !== item.id) continue;
    if (!isRealScore(mark)) {
      unusable += 1;
      continue;
    }
    const key = JSON.stringify([mark.useKind, mark.useId, mark.answerer]);
    const entry = {
      mark,
      share: mark.points / mark.maxPoints,
      isCurrent: scoredWithCurrentKey(item, mark.reveal),
    };
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  let earlier = 0;
  let duplicates = 0;
  const current: Counted<M>[] = [];
  for (const group of groups.values()) {
    duplicates += group.length - 1;
    const [kept] = [...group].sort(preferred);
    if (kept.isCurrent) current.push({ mark: kept.mark, share: kept.share });
    else earlier += 1;
  }
  current.sort(
    (a, b) =>
      compareStrings(activityOf(a.mark), activityOf(b.mark)) ||
      compareStrings(a.mark.answerer, b.mark.answerer),
  );
  return { current, earlier, unusable, duplicates };
}

// ---------------------------------------------------------------------------
// The figures
// ---------------------------------------------------------------------------

const sum = (values: readonly number[]): number => values.reduce((total, v) => total + v, 0);

const allSame = (values: readonly number[]): boolean => values.every((v) => v === values[0]);

/** Pearson's r of two columns of the same length, both known to vary. Clamped against rounding. */
function correlation(xs: readonly number[], ys: readonly number[]): number {
  const meanX = sum(xs) / xs.length;
  const meanY = sum(ys) / ys.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    const dx = x - meanX;
    const dy = ys[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  });
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

function howHardOf(current: readonly Counted<QuestionMark>[]): HowHard {
  if (current.length === 0) return { state: "no_answers" };
  return { state: "measured", value: sum(current.map((c) => c.share)) / current.length };
}

function splitOf(current: readonly Counted<QuestionMark>[]): Split {
  const full = current.filter((c) => c.share === 1).length;
  const none = current.filter((c) => c.share === 0).length;
  return { full, partial: current.length - full - none, none };
}

/** Per use, per answerer: their points and maxPoints over every usable current-key answer. */
type Totals = Map<string, Map<string, Map<string, { points: number; maxPoints: number }>>>;

function totalsOf(settled: ReadonlyMap<string, Settled<QuestionMark>>): Totals {
  const totals: Totals = new Map();
  for (const [itemId, { current }] of settled) {
    for (const { mark } of current) {
      const use = activityOf(mark);
      const byAnswerer = totals.get(use) ?? new Map();
      totals.set(use, byAnswerer);
      const byItem = byAnswerer.get(mark.answerer) ?? new Map();
      byAnswerer.set(mark.answerer, byItem);
      byItem.set(itemId, { points: mark.points, maxPoints: mark.maxPoints });
    }
  }
  return totals;
}

function separationOf(
  itemId: string,
  current: readonly Counted<QuestionMark>[],
  totals: Totals,
): Separation {
  if (current.length < MIN_ANSWERS_FOR_FIGURES) {
    return {
      state: "not_enough_answers",
      answers: current.length,
      needed: MIN_ANSWERS_FOR_FIGURES,
    };
  }
  if (allSame(current.map((c) => c.share))) return { state: "same_score" };

  // `current` is sorted by use then answerer, so uses and their pairs come in a fixed order.
  const pairsByUse = new Map<string, { x: number; y: number }[]>();
  for (const { mark, share } of current) {
    const use = activityOf(mark);
    let points = 0;
    let maxPoints = 0;
    for (const [otherId, other] of totals.get(use)?.get(mark.answerer) ?? []) {
      if (otherId === itemId) continue;
      points += other.points;
      maxPoints += other.maxPoints;
    }
    if (maxPoints === 0) continue;
    const pairs = pairsByUse.get(use) ?? [];
    pairsByUse.set(use, pairs);
    pairs.push({ x: share, y: points / maxPoints });
  }

  let weighted = 0;
  let answersCounted = 0;
  let usesCounted = 0;
  for (const pairs of pairsByUse.values()) {
    const xs = pairs.map((p) => p.x);
    const ys = pairs.map((p) => p.y);
    if (pairs.length < MIN_ANSWERS_PER_USE || allSame(xs) || allSame(ys)) continue;
    weighted += correlation(xs, ys) * pairs.length;
    answersCounted += pairs.length;
    usesCounted += 1;
  }
  if (answersCounted === 0) return { state: "no_comparison" };
  return { state: "measured", value: weighted / answersCounted, usesCounted, answersCounted };
}

/** The choice groups a distribution counts options in: one per row, blank or slot. */
function choiceGroups(distribution: Distribution): readonly (readonly ChoiceCount[])[] {
  switch (distribution.kind) {
    case "options":
      return [distribution.options];
    case "grid":
      return distribution.rows.map((row) => row.cells);
    case "blanks":
    case "pairs":
      return distribution.blanks.map((blank) => blank.choices);
    case "slots":
      return distribution.slots.map((slot) => slot.choices);
    case "order":
      // Every step is keyed to some position, so there is no wrong option to be ahead.
      return [];
  }
}

/**
 * Whether, in any one row, blank or slot, a wrong option was chosen more often than a keyed one
 * (the least chosen keyed option of that group). Ordered response counts positions, not options,
 * and never raises it.
 */
export function wrongAnswerAhead(distribution: Distribution): boolean {
  return choiceGroups(distribution).some((choices) => {
    const keyed = choices.filter((c) => c.correct).map((c) => c.count);
    const wrong = choices.filter((c) => !c.correct).map((c) => c.count);
    return keyed.length > 0 && wrong.length > 0 && Math.max(...wrong) > Math.min(...keyed);
  });
}

function choicesOf(item: Item, answers: readonly QuestionAnswer[] | undefined): Choices {
  if (!answers) return { state: "not_read" };
  const settled = settle(item, answers);
  return {
    state: "counted",
    answers: settled.current.length,
    earlierAnswers: settled.earlier,
    duplicateAnswers: settled.duplicates,
    distribution: distributionFor(
      item,
      settled.current.map((c) => c.mark.response),
    ),
  };
}

/**
 * The flags a question with enough answers raises, in `QUESTION_FLAGS` order. A separation flag
 * needs a separation figure; a negative one raises both `does_not_separate` and
 * `separates_backwards`, since it is under both thresholds.
 */
export function flagsFor(input: {
  howHard: number;
  separation: Separation;
  wrongAnswerAhead: boolean;
}): QuestionFlag[] {
  const { howHard, separation } = input;
  const value = separation.state === "measured" ? separation.value : undefined;
  const raised: Record<QuestionFlag, boolean> = {
    too_easy: howHard >= TOO_EASY_FROM,
    too_hard: howHard <= TOO_HARD_UP_TO,
    does_not_separate: value !== undefined && value < DOES_NOT_SEPARATE_BELOW,
    separates_backwards: value !== undefined && value < SEPARATES_BACKWARDS_BELOW,
    wrong_answer_ahead: input.wrongAnswerAhead,
  };
  return QUESTION_FLAGS.filter((flag) => raised[flag]);
}

function flagsOf(
  howHard: HowHard,
  separation: Separation,
  choices: Choices,
  answers: number,
): Flags {
  if (answers < MIN_ANSWERS_FOR_FIGURES || howHard.state !== "measured") {
    return { state: "not_enough_answers", answers, needed: MIN_ANSWERS_FOR_FIGURES };
  }
  const ahead =
    choices.state === "counted" &&
    choices.answers >= MIN_ANSWERS_FOR_FIGURES &&
    wrongAnswerAhead(choices.distribution);
  return {
    state: "checked",
    raised: flagsFor({ howHard: howHard.value, separation, wrongAnswerAhead: ahead }),
  };
}

/** Every figure for every question in the quiz, one result per item in `items` order. */
export function buildQuestionStats(input: QuestionStatsInput): QuestionStats[] {
  const settled = new Map(input.items.map((item) => [item.id, settle(item, input.marks)]));
  const totals = totalsOf(settled);
  return input.items.map((item) => {
    const { current, earlier, unusable, duplicates } = settled.get(item.id) ?? settle(item, []);
    const howHard = howHardOf(current);
    const separation = separationOf(item.id, current, totals);
    const choices = choicesOf(item, input.answers?.[item.id]);
    return {
      itemId: item.id,
      answers: current.length,
      uses: new Set(current.map((c) => activityOf(c.mark))).size,
      earlierAnswers: earlier,
      unusableAnswers: unusable,
      duplicateAnswers: duplicates,
      howHard,
      split: splitOf(current),
      separation,
      choices,
      flags: flagsOf(howHard, separation, choices, current.length),
    };
  });
}
