import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import {
  DOES_NOT_SEPARATE_BELOW,
  MIN_ANSWERS_FOR_FIGURES,
  MIN_ANSWERS_PER_USE,
  QUESTION_FLAGS,
  SEPARATES_BACKWARDS_BELOW,
  TOO_EASY_FROM,
  TOO_HARD_UP_TO,
  buildQuestionStats,
  flagsFor,
  sameScoringKey,
  scoredWithCurrentKey,
  wrongAnswerAhead,
  type QuestionAnswer,
  type QuestionMark,
  type QuestionStats,
  type Separation,
  type UseKind,
} from "./questionStats";
import { itemSchema, type Item } from "./schemas";
import { revealOf } from "./submit";

const parse = (input: unknown): Item => itemSchema.parse(input);

/** Three real items, one per scoring model (docs/01 §2). */
const mc = parse(FIXTURES.multiple_choice.canonical); // 0/1, out of 1
const mr = parse(FIXTURES.multiple_response.canonical); // +/-, out of 3
const ddr = parse(FIXTURES.dropdown_rationale.canonical); // rationale triad, out of 2
const cloze = parse(FIXTURES.dropdown_cloze.canonical); // 0/1, out of 2
const order = parse(FIXTURES.ordered_response.canonical);

const mark = (
  item: Item,
  answerer: string,
  points: number,
  use = "use_a",
  useKind: UseKind = "live",
  extra: Partial<QuestionMark> = {},
): QuestionMark => ({
  useKind,
  useId: use,
  answerer,
  itemId: item.id,
  points,
  maxPoints: item.scoring.maxPoints,
  reveal: revealOf(item),
  ...extra,
});

/** A key the item no longer has: the same item with its scoring out of one more point. */
const earlierReveal = (item: Item) => ({
  ...revealOf(item),
  scoring: { ...item.scoring, maxPoints: item.scoring.maxPoints + 1 },
});

const statsOf = (stats: readonly QuestionStats[], item: Item): QuestionStats => {
  const found = stats.find((s) => s.itemId === item.id);
  if (!found) throw new Error(`no stats for ${item.id}`);
  return found;
};

/** Every number anywhere in a value, so a test can say none of them is NaN or infinite. */
const numbersIn = (value: unknown): number[] => {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(numbersIn);
  return [];
};

const measured = (separation: Separation): number => {
  if (separation.state !== "measured") throw new Error(`separation is ${separation.state}`);
  return separation.value;
};

/*
 * THE HAND-WORKED CLASS (the demo step: read this beside the expectations below).
 *
 * Three questions: Q1 = multiple choice (0/1, out of 1), Q2 = multiple response (+/-, out of 3),
 * Q3 = drop-down rationale triad (rationale, out of 2). Every student answered all three, so
 * each student's rest-of-activity for Q2 is (Q1 + Q3) out of 3, and Q2 is also out of 3: the
 * correlation can be worked in points, since dividing both columns by 3 does not change it.
 *
 * Use A, a live session, five students:
 *
 *   student  Q1  Q2  Q3 | X = Q2  Y = Q1+Q3 |  dx    dy  | dx*dy  dx^2  dy^2
 *   a1        1   3   2 |   3        3      |  1.4   1.4 |  1.96  1.96  1.96
 *   a2        1   2   1 |   2        2      |  0.4   0.4 |  0.16  0.16  0.16
 *   a3        0   2   1 |   2        1      |  0.4  -0.6 | -0.24  0.16  0.36
 *   a4        1   1   1 |   1        2      | -0.6   0.4 | -0.24  0.36  0.16
 *   a5        0   0   0 |   0        0      | -1.6  -1.6 |  2.56  2.56  2.56
 *   mean X = 8/5 = 1.6, mean Y = 8/5 = 1.6     sums:        4.20  5.20  5.20
 *   r(A) = 4.20 / sqrt(5.20 * 5.20) = 4.20 / 5.20 = 0.80769
 *
 * Use B, an assignment, fifteen students: the five patterns below, three students each (a
 * class repeated three times has the same correlation as the class once).
 *
 *   pattern  Q1  Q2  Q3 | X = Q2  Y = Q1+Q3 |  dx    dy  | dx*dy  dx^2  dy^2
 *   b1        1   3   1 |   3        2      |  1.2   0.2 |  0.24  1.44  0.04
 *   b2        0   3   2 |   3        2      |  1.2   0.2 |  0.24  1.44  0.04
 *   b3        1   1   2 |   1        3      | -0.8   1.2 | -0.96  0.64  1.44
 *   b4        0   2   0 |   2        0      |  0.2  -1.8 | -0.36  0.04  3.24
 *   b5        1   0   1 |   0        2      | -1.8   0.2 | -0.36  3.24  0.04
 *   mean X = 9/5 = 1.8, mean Y = 9/5 = 1.8     sums:       -1.20  6.80  4.80
 *   r(B) = -1.20 / sqrt(6.80 * 4.80) = -1.20 / sqrt(32.64) = -1.20 / 5.71314 = -0.21004
 *
 * Q2 has 5 + 15 = 20 answers, just enough for a separation figure and flags.
 *
 *   Separation(Q2) = (5 * 0.80769 + 15 * -0.21004) / 20 = (4.03846 - 3.15063) / 20 = 0.044
 *   How hard(Q2)   = mean of points / 3 = (8/3 [use A] + 3 * 9/3 [use B]) / 20 = 35/60 = 0.583
 *   Split(Q2)      = full (3 of 3): a1, b1 x3, b2 x3 = 7; none: a5, b5 x3 = 4; partial: 9
 *   How hard(Q1)   = (3 [use A] + 3 * 3 [use B]) / 20 = 12/20 = 0.600
 *   How hard(Q3)   = shares (1 + .5 + .5 + .5 + 0) + 3 * (.5 + 1 + 1 + 0 + .5) = 2.5 + 9 = 11.5;
 *                    11.5 / 20 = 0.575
 *   Flags(Q2): 0.044 is under 0.15, so does_not_separate; not under 0, so not separates_backwards;
 *              0.583 is neither 0.90 or more nor 0.30 or less.
 */
const CLASS_A: [string, number, number, number][] = [
  ["a1", 1, 3, 2],
  ["a2", 1, 2, 1],
  ["a3", 0, 2, 1],
  ["a4", 1, 1, 1],
  ["a5", 0, 0, 0],
];
const PATTERNS_B: [string, number, number, number][] = [
  ["b1", 1, 3, 1],
  ["b2", 0, 3, 2],
  ["b3", 1, 1, 2],
  ["b4", 0, 2, 0],
  ["b5", 1, 0, 1],
];

const rowsToMarks = (
  rows: readonly [string, number, number, number][],
  use: string,
  useKind: UseKind,
): QuestionMark[] =>
  rows.flatMap(([answerer, q1, q2, q3]) => [
    mark(mc, answerer, q1, use, useKind),
    mark(mr, answerer, q2, use, useKind),
    mark(ddr, answerer, q3, use, useKind),
  ]);

const repeat = (rows: readonly [string, number, number, number][], times: number) =>
  Array.from({ length: times }, (_, copy) =>
    rows.map(([id, ...rest]) => [`${id}_${copy + 1}`, ...rest] as [string, number, number, number]),
  ).flat();

const CLASS_MARKS: QuestionMark[] = [
  ...rowsToMarks(CLASS_A, "live_a", "live"),
  ...rowsToMarks(repeat(PATTERNS_B, 3), "asg_b", "assignment"),
];
const CLASS_ITEMS = [mc, mr, ddr];

describe("buildQuestionStats: the hand-worked class (#615)", () => {
  const stats = buildQuestionStats({ items: CLASS_ITEMS, marks: CLASS_MARKS });

  it("returns one result per question, in the quiz's order", () => {
    expect(stats.map((s) => s.itemId)).toEqual([mc.id, mr.id, ddr.id]);
  });

  it("works out how hard each question is as the mean share of points earned", () => {
    const q2 = statsOf(stats, mr);
    expect(q2.howHard.state).toBe("measured");
    if (q2.howHard.state !== "measured") return;
    expect(q2.howHard.value).toBeCloseTo(0.583, 3);
    const q1 = statsOf(stats, mc).howHard;
    const q3 = statsOf(stats, ddr).howHard;
    expect(q1.state === "measured" && q1.value).toBeCloseTo(0.6, 3);
    expect(q3.state === "measured" && q3.value).toBeCloseTo(0.575, 3);
  });

  it("works out separation per use and combines the uses weighted by answers", () => {
    const q2 = statsOf(stats, mr);
    expect(measured(q2.separation)).toBeCloseTo(0.044, 3);
    expect(q2.separation).toMatchObject({ usesCounted: 2, answersCounted: 20 });
  });

  it("splits full, partial and no marks, and counts answers and uses", () => {
    expect(statsOf(stats, mr)).toMatchObject({
      answers: 20,
      uses: 2,
      earlierAnswers: 0,
      unusableAnswers: 0,
      duplicateAnswers: 0,
      split: { full: 7, partial: 9, none: 4 },
    });
  });

  it("raises does_not_separate and nothing else for Q2", () => {
    expect(statsOf(stats, mr).flags).toEqual({ state: "checked", raised: ["does_not_separate"] });
  });

  it("gives the same result for the answers in any order", () => {
    const reversed = [...CLASS_MARKS].reverse();
    const interleaved = [
      ...CLASS_MARKS.filter((_, i) => i % 2 === 1),
      ...CLASS_MARKS.filter((_, i) => i % 2 === 0),
    ];
    expect(buildQuestionStats({ items: CLASS_ITEMS, marks: reversed })).toEqual(stats);
    expect(buildQuestionStats({ items: CLASS_ITEMS, marks: interleaved })).toEqual(stats);
  });

  it("never puts NaN or an infinity anywhere in the result", () => {
    expect(numbersIn(stats).every(Number.isFinite)).toBe(true);
  });
});

describe("buildQuestionStats: partial credit counts as partial", () => {
  const twenty = (item: Item, points: (i: number) => number) =>
    Array.from({ length: 20 }, (_, i) => mark(item, `s${i}`, points(i)));

  it("0/1 (drop-down cloze, out of 2): one blank right is half a mark", () => {
    const [stats] = buildQuestionStats({ items: [cloze], marks: twenty(cloze, () => 1) });
    expect(stats.howHard).toEqual({ state: "measured", value: 0.5 });
    expect(stats.split).toEqual({ full: 0, partial: 20, none: 0 });
  });

  it("+/- (multiple response, out of 3): two of three is two thirds", () => {
    const [stats] = buildQuestionStats({ items: [mr], marks: twenty(mr, () => 2) });
    expect(stats.howHard.state === "measured" && stats.howHard.value).toBeCloseTo(2 / 3, 10);
    expect(stats.split).toEqual({ full: 0, partial: 20, none: 0 });
  });

  it("rationale (triad, out of 2): the anchor and one support is half", () => {
    const [stats] = buildQuestionStats({
      items: [ddr],
      marks: twenty(ddr, (i) => (i < 10 ? 1 : 2)),
    });
    expect(stats.howHard).toEqual({ state: "measured", value: 0.75 });
    expect(stats.split).toEqual({ full: 10, partial: 10, none: 0 });
  });
});

describe("buildQuestionStats: defined values at the edges", () => {
  it("an empty input gives an empty result", () => {
    expect(buildQuestionStats({ items: [], marks: [] })).toEqual([]);
  });

  it("a question nobody has answered says so in every figure", () => {
    const [stats] = buildQuestionStats({ items: [mr], marks: [] });
    expect(stats).toEqual({
      itemId: mr.id,
      answers: 0,
      uses: 0,
      earlierAnswers: 0,
      unusableAnswers: 0,
      duplicateAnswers: 0,
      howHard: { state: "no_answers" },
      split: { full: 0, partial: 0, none: 0 },
      separation: { state: "not_enough_answers", answers: 0, needed: MIN_ANSWERS_FOR_FIGURES },
      choices: { state: "not_read" },
      flags: { state: "not_enough_answers", answers: 0, needed: MIN_ANSWERS_FOR_FIGURES },
    });
  });

  it(`fewer than ${MIN_ANSWERS_FOR_FIGURES} answers: how hard, but no separation and no flag`, () => {
    expect(MIN_ANSWERS_FOR_FIGURES).toBe(20);
    const marks = CLASS_MARKS.filter((m) => !m.answerer.endsWith("_3"));
    const stats = statsOf(buildQuestionStats({ items: CLASS_ITEMS, marks }), mr);
    expect(stats.answers).toBe(15);
    expect(stats.howHard.state).toBe("measured");
    expect(stats.separation).toEqual({ state: "not_enough_answers", answers: 15, needed: 20 });
    expect(stats.flags).toEqual({ state: "not_enough_answers", answers: 15, needed: 20 });
  });

  it("every answer scored the same: no separation figure, never NaN", () => {
    const marks = Array.from({ length: 20 }, (_, i) => [
      mark(mr, `s${i}`, 3),
      mark(mc, `s${i}`, i % 2),
    ]).flat();
    const stats = statsOf(buildQuestionStats({ items: [mc, mr], marks }), mr);
    expect(stats.separation).toEqual({ state: "same_score" });
    expect(stats.flags).toEqual({ state: "checked", raised: ["too_easy"] });
    expect(numbersIn(stats).every(Number.isFinite)).toBe(true);
  });

  it("a rest of the activity that scored the same for everyone adds nothing", () => {
    const marks = Array.from({ length: 20 }, (_, i) => [
      mark(mr, `s${i}`, i % 4),
      mark(mc, `s${i}`, 1),
    ]).flat();
    const stats = statsOf(buildQuestionStats({ items: [mc, mr], marks }), mr);
    expect(stats.separation).toEqual({ state: "no_comparison" });
  });

  it("a single-question activity has nothing to compare against", () => {
    const marks = Array.from({ length: 20 }, (_, i) => mark(mr, `s${i}`, i % 4));
    const [stats] = buildQuestionStats({ items: [mr], marks });
    expect(stats.separation).toEqual({ state: "no_comparison" });
    expect(stats.flags).toEqual({ state: "checked", raised: [] });
  });

  it(`a use with fewer than ${MIN_ANSWERS_PER_USE} answers adds nothing`, () => {
    expect(MIN_ANSWERS_PER_USE).toBe(5);
    // Use A as above (r = 0.80769), plus three uses of four students that would pull it down.
    const small = [0, 1, 2].flatMap((u) =>
      rowsToMarks(PATTERNS_B.slice(0, 4), `small_${u}`, "assignment").map((m) => ({
        ...m,
        answerer: `${m.answerer}_${u}`,
      })),
    );
    const marks = [...rowsToMarks(CLASS_A, "live_a", "live"), ...small];
    // 5 + 12 = 17 answers; three more in a use of their own with no other question reach 20.
    const lone = [1, 2, 3].map((i) => mark(mr, `lone_${i}`, i, "lone", "live"));
    const stats = statsOf(
      buildQuestionStats({ items: CLASS_ITEMS, marks: [...marks, ...lone] }),
      mr,
    );
    expect(stats.answers).toBe(20);
    expect(stats.uses).toBe(5);
    expect(measured(stats.separation)).toBeCloseTo(0.808, 3);
    expect(stats.separation).toMatchObject({ usesCounted: 1, answersCounted: 5 });
  });

  it("an answerer with no other scored answer in that use is left out of its separation", () => {
    const extra = [mark(mr, "late", 3, "live_a", "live")];
    const marks = [...CLASS_MARKS, ...extra];
    const stats = statsOf(buildQuestionStats({ items: CLASS_ITEMS, marks }), mr);
    expect(stats.answers).toBe(21);
    expect(stats.separation).toMatchObject({ answersCounted: 20 });
    expect(measured(stats.separation)).toBeCloseTo(0.044, 3);
  });

  it("an impossible score is set aside and counted, never divided by", () => {
    const bad = [
      mark(mr, "zero_max", 0, "live_a", "live", { maxPoints: 0 }),
      mark(mr, "nan", Number.NaN),
      mark(mr, "over", 4),
      mark(mr, "under", -1),
      mark(mc, "a1", 1, "live_a", "live", { maxPoints: Number.POSITIVE_INFINITY }),
    ];
    const clean = buildQuestionStats({ items: CLASS_ITEMS, marks: CLASS_MARKS });
    const dirty = buildQuestionStats({ items: CLASS_ITEMS, marks: [...CLASS_MARKS, ...bad] });
    expect(statsOf(dirty, mr)).toEqual({ ...statsOf(clean, mr), unusableAnswers: 4 });
    expect(numbersIn(dirty).every(Number.isFinite)).toBe(true);
  });

  it("ignores marks for a question that is not in the quiz", () => {
    const stray = mark(cloze, "a1", 2, "live_a", "live");
    expect(buildQuestionStats({ items: CLASS_ITEMS, marks: [...CLASS_MARKS, stray] })).toEqual(
      buildQuestionStats({ items: CLASS_ITEMS, marks: CLASS_MARKS }),
    );
  });
});

describe("buildQuestionStats: the order of the quiz's questions", () => {
  it("gives exactly the same separation whatever order the questions come in", () => {
    // Non-integer points on three other questions, so the rest-of-activity sum depends on the
    // order it is added in unless that order is fixed.
    const others = [mc, cloze, ddr];
    const fractions = [0.1, 0.2, 0.3, 0.7];
    const marks = Array.from({ length: MIN_ANSWERS_FOR_FIGURES }, (_, i) => [
      mark(mr, `s${i}`, i % 4),
      ...others.map((item, k) => mark(item, `s${i}`, fractions[(i + k) % 4] * (1 + (i % 3) / 10))),
    ]).flat();
    const items = [mr, ...others];
    const reference = statsOf(buildQuestionStats({ items, marks }), mr).separation;
    expect(reference.state).toBe("measured");
    for (const shuffled of [
      [ddr, cloze, mc, mr],
      [cloze, mr, ddr, mc],
      [mc, ddr, mr, cloze],
      [ddr, mc, cloze, mr],
    ]) {
      const separation = statsOf(buildQuestionStats({ items: shuffled, marks }), mr).separation;
      expect(separation).toEqual(reference);
    }
  });
});

describe("buildQuestionStats: one answer per answerer per question per use", () => {
  it("keeps the current-key answer, then the higher share, whichever order they came in", () => {
    const twice = [mark(mr, "a2", 0, "live_a", "live"), mark(mr, "a2", 3, "live_a", "live")];
    const stale = mark(mr, "a2", 1, "live_a", "live", { reveal: earlierReveal(mr) });
    const base = CLASS_MARKS.filter((m) => !(m.answerer === "a2" && m.itemId === mr.id));
    const expected = buildQuestionStats({
      items: CLASS_ITEMS,
      marks: [...base, mark(mr, "a2", 3, "live_a", "live")],
    });
    for (const marks of [
      [...base, ...twice, stale],
      [stale, ...[...twice].reverse(), ...base],
    ]) {
      const stats = buildQuestionStats({ items: CLASS_ITEMS, marks });
      expect(statsOf(stats, mr)).toEqual({ ...statsOf(expected, mr), duplicateAnswers: 2 });
    }
  });

  it("the same answerer key in two uses is two answerers", () => {
    const marks = [mark(mr, "s1", 3, "u1"), mark(mr, "s1", 0, "u2", "assignment")];
    const [stats] = buildQuestionStats({ items: [mr], marks });
    expect(stats).toMatchObject({ answers: 2, uses: 2, duplicateAnswers: 0 });
  });
});

describe("buildQuestionStats: answers scored with an earlier key", () => {
  const clean = buildQuestionStats({ items: CLASS_ITEMS, marks: CLASS_MARKS });

  it("are counted in earlierAnswers and change no figure", () => {
    const earlier = [
      // On the question itself, and on the rest of the activity it is measured against.
      ...["old1", "old2", "old3"].map((a) =>
        mark(mr, a, 3, "live_a", "live", { reveal: earlierReveal(mr) }),
      ),
      ...["old1", "old2", "old3"].map((a) =>
        mark(mc, a, 0, "live_a", "live", { reveal: earlierReveal(mc) }),
      ),
    ];
    const stats = buildQuestionStats({ items: CLASS_ITEMS, marks: [...CLASS_MARKS, ...earlier] });
    expect(statsOf(stats, mr)).toEqual({ ...statsOf(clean, mr), earlierAnswers: 3 });
    expect(statsOf(stats, mc)).toEqual({ ...statsOf(clean, mc), earlierAnswers: 3 });
  });

  it("an earlier key on another question takes that answer out of the rest share", () => {
    // a1's Q1 was scored on an earlier key: their rest is Q3 alone, 2 of 2, as before 3 of 3.
    const marks = CLASS_MARKS.map((m) =>
      m.answerer === "a1" && m.itemId === mc.id ? { ...m, reveal: earlierReveal(mc) } : m,
    );
    const stats = statsOf(buildQuestionStats({ items: CLASS_ITEMS, marks }), mr);
    expect(measured(stats.separation)).toBeCloseTo(0.044, 3);
  });

  it("restart every figure once the key changes", () => {
    const changed = parse({
      ...FIXTURES.multiple_response.canonical,
      answerKey: { correctOptionIds: ["opt_a", "opt_b", "opt_e"] },
    });
    const items = [mc, changed, ddr];
    const stats = statsOf(buildQuestionStats({ items, marks: CLASS_MARKS }), changed);
    expect(stats).toMatchObject({
      answers: 0,
      earlierAnswers: 20,
      howHard: { state: "no_answers" },
    });
  });

  it("a changed stem or option text does not restart them", () => {
    const reworded = parse({
      ...FIXTURES.multiple_response.canonical,
      stem: { kind: "markdown", value: "Reworded." },
      content: {
        ...FIXTURES.multiple_response.canonical.content,
        options: FIXTURES.multiple_response.canonical.content.options.map((o) => ({
          ...o,
          label: `${o.label}.`,
        })),
      },
    });
    const items = [mc, reworded, ddr];
    expect(statsOf(buildQuestionStats({ items, marks: CLASS_MARKS }), reworded)).toEqual(
      statsOf(clean, mr),
    );
  });
});

describe("scoredWithCurrentKey and sameScoringKey", () => {
  it("is true for the reveal the item itself would store", () => {
    for (const item of [mc, mr, ddr, cloze, order]) {
      expect(scoredWithCurrentKey(item, revealOf(item))).toBe(true);
    }
  });

  it("treats a row with no stored reveal as scored with today's key, as the reveal does", () => {
    expect(scoredWithCurrentKey(mr, null)).toBe(true);
    expect(scoredWithCurrentKey(mr, undefined)).toBe(true);
  });

  it("treats a reveal that is not an object as an earlier key", () => {
    for (const stored of ["key", 3, true, [revealOf(mr)]]) {
      expect(scoredWithCurrentKey(mr, stored)).toBe(false);
    }
  });

  it("treats a reveal with no key or no scoring as an earlier key", () => {
    expect(scoredWithCurrentKey(mr, { scoring: mr.scoring })).toBe(false);
    expect(scoredWithCurrentKey(mr, { answerKey: mr.answerKey })).toBe(false);
  });

  it("ignores the rationale: rewording it changes no figure", () => {
    expect(scoredWithCurrentKey(mr, { ...revealOf(mr), rationale: { general: "x" } })).toBe(true);
  });

  it("is the same key when object properties come in another order", () => {
    if (ddr.type !== "dropdown_rationale") throw new Error("fixture");
    const stored = {
      scoring: { maxPoints: ddr.scoring.maxPoints, model: ddr.scoring.model },
      answerKey: {
        blanks: ddr.answerKey.blanks.map((b) => ({
          correctChoiceId: b.correctChoiceId,
          blankId: b.blankId,
        })),
        anchorBlankId: ddr.answerKey.anchorBlankId,
      },
    };
    expect(sameScoringKey(ddr, stored)).toBe(true);
  });

  it("is the same key when a set of ids comes in another order", () => {
    expect(
      sameScoringKey(mr, {
        answerKey: { correctOptionIds: ["opt_d", "opt_a", "opt_b"] },
        scoring: mr.scoring,
      }),
    ).toBe(true);
  });

  it("is the same key when keyed rows or blanks come in another order", () => {
    const table = parse(FIXTURES.dropdown_table.canonical);
    if (table.type !== "dropdown_table") throw new Error("fixture");
    const rows = [...table.answerKey.rows].reverse();
    expect(sameScoringKey(table, { answerKey: { rows }, scoring: table.scoring })).toBe(true);
    if (ddr.type !== "dropdown_rationale") throw new Error("fixture");
    const blanks = [...ddr.answerKey.blanks].reverse();
    expect(
      sameScoringKey(ddr, { answerKey: { ...ddr.answerKey, blanks }, scoring: ddr.scoring }),
    ).toBe(true);
  });

  it("is a different key when an ordered response's order changes", () => {
    if (order.type !== "ordered_response") throw new Error("fixture");
    const orderedIds = [...order.answerKey.orderedIds].reverse();
    expect(sameScoringKey(order, { answerKey: { orderedIds }, scoring: order.scoring })).toBe(
      false,
    );
  });

  it("is a different key when the scoring model or the points change", () => {
    expect(sameScoringKey(mr, earlierReveal(mr))).toBe(false);
    expect(
      sameScoringKey(mr, { ...revealOf(mr), scoring: { model: "zero_one", maxPoints: 3 } }),
    ).toBe(false);
  });
});

describe("flagsFor: each flag just under and just over its threshold", () => {
  const none: Separation = { state: "no_comparison" };
  const sep = (value: number): Separation => ({
    state: "measured",
    value,
    usesCounted: 1,
    answersCounted: 20,
  });
  const raised = (howHard: number, separation: Separation = none, ahead = false) =>
    flagsFor({ howHard, separation, wrongAnswerAhead: ahead });

  it("names every flag and threshold as a constant", () => {
    expect(QUESTION_FLAGS).toEqual([
      "too_easy",
      "too_hard",
      "does_not_separate",
      "separates_backwards",
      "wrong_answer_ahead",
    ]);
    expect([
      TOO_EASY_FROM,
      TOO_HARD_UP_TO,
      DOES_NOT_SEPARATE_BELOW,
      SEPARATES_BACKWARDS_BELOW,
    ]).toEqual([0.9, 0.3, 0.15, 0]);
  });

  it("too_easy: how hard is 0.90 or more", () => {
    expect(raised(0.899)).toEqual([]);
    expect(raised(0.9)).toEqual(["too_easy"]);
    expect(raised(0.901)).toEqual(["too_easy"]);
  });

  it("too_hard: how hard is 0.30 or less", () => {
    expect(raised(0.301)).toEqual([]);
    expect(raised(0.3)).toEqual(["too_hard"]);
    expect(raised(0.299)).toEqual(["too_hard"]);
  });

  it("does_not_separate: separation under 0.15", () => {
    expect(raised(0.5, sep(0.15))).toEqual([]);
    expect(raised(0.5, sep(0.151))).toEqual([]);
    expect(raised(0.5, sep(0.149))).toEqual(["does_not_separate"]);
  });

  it("separates_backwards: separation under 0 (and so also under 0.15)", () => {
    expect(raised(0.5, sep(0))).toEqual(["does_not_separate"]);
    expect(raised(0.5, sep(0.001))).toEqual(["does_not_separate"]);
    expect(raised(0.5, sep(-0.001))).toEqual(["does_not_separate", "separates_backwards"]);
  });

  it("raises no separation flag when there is no separation figure", () => {
    expect(raised(0.5, { state: "same_score" })).toEqual([]);
    expect(raised(0.5, { state: "not_enough_answers", answers: 3, needed: 20 })).toEqual([]);
  });

  it("wrong_answer_ahead: as the choices say", () => {
    expect(raised(0.5, none, true)).toEqual(["wrong_answer_ahead"]);
  });
});

describe("choices and wrong_answer_ahead", () => {
  if (mr.type !== "multiple_response") throw new Error("fixture");
  /** `n` answers picking `optionIds`, each one scored as the item would. */
  const answers = (n: number, optionIds: string[], from = 0, reveal: unknown = revealOf(mr)) =>
    Array.from({ length: n }, (_, i): QuestionAnswer => ({
      ...mark(mr, `s${from + i}`, 1),
      reveal,
      response: { type: "multiple_response", optionIds },
    }));
  const marks = Array.from({ length: 20 }, (_, i) => mark(mr, `s${i}`, i % 4));

  it("counts which answers were chosen from current-key answers only", () => {
    const rows = [...answers(20, ["opt_a"]), ...answers(4, ["opt_f"], 20, earlierReveal(mr))];
    const [stats] = buildQuestionStats({ items: [mr], marks, answers: { [mr.id]: rows } });
    expect(stats.choices.state).toBe("counted");
    if (stats.choices.state !== "counted") return;
    expect(stats.choices).toMatchObject({ answers: 20, earlierAnswers: 4, duplicateAnswers: 0 });
    expect(stats.choices.distribution.kind).toBe("options");
    const counts = Object.fromEntries(
      stats.choices.distribution.kind === "options"
        ? stats.choices.distribution.options.map((o) => [o.id, o.count])
        : [],
    );
    expect(counts).toMatchObject({ opt_a: 20, opt_f: 0 });
  });

  it("raises wrong_answer_ahead when a wrong option beats a keyed one", () => {
    // opt_c (wrong) picked 11 times, opt_d (keyed) 10.
    const rows = [...answers(10, ["opt_a", "opt_b", "opt_d"]), ...answers(10, ["opt_c"], 10)];
    rows.push(...answers(1, ["opt_c"], 20));
    const [stats] = buildQuestionStats({ items: [mr], marks, answers: { [mr.id]: rows } });
    expect(stats.flags).toEqual({ state: "checked", raised: ["wrong_answer_ahead"] });
  });

  it("does not raise it on a tie", () => {
    const rows = [...answers(10, ["opt_a", "opt_b", "opt_d"]), ...answers(10, ["opt_c"], 10)];
    const [stats] = buildQuestionStats({ items: [mr], marks, answers: { [mr.id]: rows } });
    expect(stats.flags).toEqual({ state: "checked", raised: [] });
  });

  it(`does not raise it from fewer than ${MIN_ANSWERS_FOR_FIGURES} answers read`, () => {
    const rows = [...answers(9, ["opt_a", "opt_b", "opt_d"]), ...answers(10, ["opt_c"], 9)];
    const [stats] = buildQuestionStats({ items: [mr], marks, answers: { [mr.id]: rows } });
    expect(stats.flags).toEqual({ state: "checked", raised: [] });
  });

  it("counts each answerer once per use in the choices too", () => {
    const rows = [...answers(20, ["opt_a"]), ...answers(3, ["opt_c"])];
    const [stats] = buildQuestionStats({ items: [mr], marks, answers: { [mr.id]: rows } });
    expect(stats.choices).toMatchObject({ state: "counted", answers: 20, duplicateAnswers: 3 });
  });

  it("keeps the same one of two equal-scored duplicates with different responses, in any order", () => {
    // A tie (10 keyed sets, 10 opt_c), plus a second answer from s0, scored the same, for opt_c.
    // Keeping that one would put opt_c (11) ahead of opt_d (9); the order must not decide which.
    const rows = [
      ...answers(10, ["opt_a", "opt_b", "opt_d"]),
      ...answers(10, ["opt_c"], 10),
      ...answers(1, ["opt_c"]),
    ];
    const forward = buildQuestionStats({ items: [mr], marks, answers: { [mr.id]: rows } });
    const reversed = buildQuestionStats({
      items: [mr],
      marks,
      answers: { [mr.id]: [...rows].reverse() },
    });
    expect(reversed).toEqual(forward);
    expect(forward[0].choices).toMatchObject({ answers: 20, duplicateAnswers: 1 });
    expect(forward[0].flags).toEqual({ state: "checked", raised: [] });
  });

  it("wrongAnswerAhead reads every distribution kind that counts options, and not order", () => {
    const choice = (id: string, count: number, correct: boolean) => ({
      id,
      label: id,
      count,
      correct,
    });
    const ahead = [choice("k", 1, true), choice("w", 2, false)];
    const behind = [choice("k", 2, true), choice("w", 1, false)];
    const base = { itemId: "x", responded: 3, unreadable: 0 };
    expect(
      wrongAnswerAhead({
        ...base,
        itemType: "multiple_choice",
        kind: "options",
        selection: "single",
        options: ahead,
        unanswered: 0,
      }),
    ).toBe(true);
    expect(
      wrongAnswerAhead({
        ...base,
        itemType: "matrix_multiple_choice",
        kind: "grid",
        selection: "single",
        columns: null,
        rows: [
          { id: "r1", label: "r1", cells: behind, unanswered: 0 },
          { id: "r2", label: "r2", cells: ahead, unanswered: 0 },
        ],
      }),
    ).toBe(true);
    expect(
      wrongAnswerAhead({
        ...base,
        itemType: "dropdown_cloze",
        kind: "blanks",
        blanks: [{ id: "b", label: "b", choices: behind, unanswered: 0 }],
      }),
    ).toBe(false);
    expect(
      wrongAnswerAhead({
        ...base,
        itemType: "bowtie",
        kind: "slots",
        slots: [{ id: "condition", label: "c", capacity: 1, choices: ahead, unanswered: 0 }],
      }),
    ).toBe(true);
    expect(
      wrongAnswerAhead({
        ...base,
        itemType: "dropdown_rationale",
        kind: "pairs",
        anchorBlankId: null,
        blanks: [{ id: "b", label: "b", choices: ahead, unanswered: 0 }],
        allCorrect: 0,
        commonWrong: [],
      }),
    ).toBe(true);
    expect(
      wrongAnswerAhead({
        ...base,
        itemType: "ordered_response",
        kind: "order",
        positions: [{ position: 1, choices: ahead, unanswered: 0 }],
        exact: 0,
      }),
    ).toBe(false);
  });

  it("a group with no wrong choice, or no keyed one, raises nothing", () => {
    const base = {
      itemId: "x",
      itemType: "multiple_response" as const,
      responded: 3,
      unreadable: 0,
    };
    const all = (correct: boolean) => [
      { id: "a", label: "a", count: 3, correct },
      { id: "b", label: "b", count: 0, correct },
    ];
    for (const correct of [true, false]) {
      expect(
        wrongAnswerAhead({
          ...base,
          kind: "options",
          selection: "multiple",
          options: all(correct),
          unanswered: 0,
        }),
      ).toBe(false);
    }
  });
});
