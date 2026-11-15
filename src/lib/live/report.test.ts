import { describe, expect, it } from "vitest";
import {
  buildSessionReport,
  byScore,
  groupByCaseStudy,
  inCaseStudies,
  markOfScore,
  questionLabel,
  questionNumber,
  stepLabel,
  summarizeReport,
  type ReportItemInput,
  type SessionReportInput,
} from "./report";
import { REPORT_FIXTURE } from "./reportFixture";

const report = buildSessionReport(REPORT_FIXTURE);
const student = (id: string) => report.students.find((row) => row.participantId === id);

describe("buildSessionReport: per student", () => {
  it("has one row per participant, including one who answered nothing", () => {
    expect(report.students.map((row) => row.participantId).sort()).toEqual([
      "p-ava",
      "p-ben",
      "p-cleo",
      "p-dev",
    ]);
  });

  it("lists students by display name, not by who joined first", () => {
    const plain = report.students.filter((row) => row.participantId !== "p-cleo");
    expect(plain.map((row) => row.displayName)).toEqual(["Ava", "Ben", "Dev"]);
  });

  it("puts each score under its item and leaves an unanswered item empty", () => {
    expect(student("p-ben")?.scores).toEqual([
      { points: 0, maxPoints: 1 },
      { points: 2, maxPoints: 3 },
      null,
      null,
    ]);
  });

  it("totals out of every item anyone answered, so a skipped item counts against the total", () => {
    expect(student("p-ava")).toMatchObject({ points: 5, possible: 6, answered: 3 });
    expect(student("p-ava")?.percent).toBeCloseTo(83.333, 2);
    expect(student("p-ben")).toMatchObject({ points: 2, possible: 6, answered: 2 });
    expect(student("p-cleo")?.percent).toBeCloseTo(16.667, 2);
    expect(student("p-dev")).toMatchObject({ points: 0, possible: 6, percent: 0, answered: 0 });
  });

  it("has no percent when nothing in the session was answered", () => {
    const empty = buildSessionReport({ ...REPORT_FIXTURE, responses: [] });
    expect(empty.students.every((row) => row.possible === 0 && row.percent === null)).toBe(true);
  });

  it("breaks a tie in names by who joined first", () => {
    const twins = buildSessionReport({
      items: [],
      responses: [],
      participants: [
        { id: "late", displayName: "Sam", joinedAt: "2026-09-22T10:00:09Z" },
        { id: "early", displayName: "sam", joinedAt: "2026-09-22T10:00:01Z" },
        { id: "same-time-b", displayName: "Sam", joinedAt: "2026-09-22T10:00:09Z" },
      ],
    });
    expect(twins.students.map((row) => row.participantId)).toEqual([
      "early",
      "late",
      "same-time-b",
    ]);
  });
});

describe("buildSessionReport: per item", () => {
  it("keeps the session's order", () => {
    expect(report.items.map((row) => row.position)).toEqual([1, 2, 3, 4]);
  });

  it("counts full, partial and no marks the way the live dashboard does", () => {
    expect(report.items[0]).toMatchObject({ responded: 3, full: 2, partial: 0, none: 1 });
    expect(report.items[1]).toMatchObject({ responded: 2, full: 1, partial: 1, none: 0 });
    expect(report.items[2]).toMatchObject({ responded: 1, full: 0, partial: 1, none: 0 });
  });

  it("counts the students who did not answer", () => {
    expect(report.items.map((row) => row.unanswered)).toEqual([1, 2, 3, 4]);
  });

  it("gives the mean in points and as a percent of the item's worth", () => {
    expect(report.items[0]?.meanPoints).toBeCloseTo(0.667, 3);
    expect(report.items[0]?.meanPercent).toBeCloseTo(66.667, 2);
    expect(report.items[1]).toMatchObject({ meanPoints: 2.5, maxPoints: 3 });
    expect(report.items[2]).toMatchObject({ meanPoints: 1, maxPoints: 2, meanPercent: 50 });
  });

  it("has no mean for an item nobody answered", () => {
    expect(report.items[3]).toMatchObject({
      responded: 0,
      meanPoints: null,
      maxPoints: null,
      meanPercent: null,
    });
  });

  it("has no percent for an item worth nothing", () => {
    const free = buildSessionReport({
      ...REPORT_FIXTURE,
      responses: [{ participantId: "p-ava", itemPosition: 4, points: 0, maxPoints: 0 }],
    });
    expect(free.items[3]).toMatchObject({ responded: 1, full: 1, meanPercent: null });
  });

  it("reads a negative score as no marks", () => {
    const negative = buildSessionReport({
      ...REPORT_FIXTURE,
      responses: [{ participantId: "p-ava", itemPosition: 2, points: -1, maxPoints: 3 }],
    });
    expect(negative.items[1]).toMatchObject({ full: 0, partial: 0, none: 1 });
  });
});

describe("buildSessionReport: per CJMM step", () => {
  it("lists only the steps some item is tagged with, in step order", () => {
    expect(report.steps.map((row) => row.step)).toEqual([1, 5]);
  });

  it("names each step", () => {
    expect(report.steps.map((row) => row.label)).toEqual(["Recognize Cues", "Take Action"]);
  });

  it("averages the tagged items' mean percents, each item counting once", () => {
    // Item 1 averaged 66.7% over three answers and item 2 83.3% over two: the step is 75%, not the
    // 71.4% that pooling the five answers' points would give.
    expect(report.steps[0]).toMatchObject({ step: 1, itemCount: 2, responded: 5 });
    expect(report.steps[0]?.meanPercent).toBeCloseTo(75, 5);
    expect(report.steps[1]).toMatchObject({ step: 5, itemCount: 1, responded: 1, meanPercent: 50 });
  });

  it("leaves untagged items out", () => {
    const untaggedOnly = buildSessionReport({
      ...REPORT_FIXTURE,
      items: REPORT_FIXTURE.items.map((item) => ({ ...item, cjmmStep: null })),
    });
    expect(untaggedOnly.steps).toEqual([]);
  });

  it("has no mean for a step whose items nobody answered", () => {
    const unanswered = buildSessionReport({ ...REPORT_FIXTURE, responses: [] });
    expect(unanswered.steps[0]).toMatchObject({ step: 1, responded: 0, meanPercent: null });
  });
});

describe("buildSessionReport: input it does not trust", () => {
  it("ignores an answer from someone not on the roster or at a position not in the session", () => {
    const stray = buildSessionReport({
      ...REPORT_FIXTURE,
      responses: [
        { participantId: "p-ghost", itemPosition: 1, points: 1, maxPoints: 1 },
        { participantId: "p-ava", itemPosition: 9, points: 1, maxPoints: 1 },
      ],
    });
    expect(stray.items.every((row) => row.responded === 0)).toBe(true);
    expect(stray.students.every((row) => row.answered === 0)).toBe(true);
  });

  it("does not change what it was given", () => {
    const input: SessionReportInput = structuredClone(REPORT_FIXTURE);
    const before = JSON.stringify(input);
    buildSessionReport(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("orders items by position whatever order they arrive in", () => {
    const shuffled = buildSessionReport({
      ...REPORT_FIXTURE,
      items: [...REPORT_FIXTURE.items].reverse(),
    });
    expect(shuffled.items.map((row) => row.position)).toEqual([1, 2, 3, 4]);
    expect(shuffled.students.find((row) => row.participantId === "p-ava")?.scores[0]).toEqual({
      points: 1,
      maxPoints: 1,
    });
  });
});

describe("a session that played a case study in place (#469)", () => {
  // A loose question, a case study's three steps, then another loose question.
  const items: ReportItemInput[] = [1, 2, 3, 4, 5].map((position) => ({
    position,
    itemId: `i-${position}`,
    ref: `ref-${position}`,
    type: "multiple_choice",
    cjmmStep: null,
  }));
  const places = [{ caseStudyId: "c-1", title: "Hip", firstPosition: 2, stepCount: 3 }];

  it("marks each step with its case study and its step, counted from the case study's start", () => {
    const marked = inCaseStudies(items, places);
    expect(marked.map((item) => item.caseStudy ?? null)).toEqual([
      null,
      { id: "c-1", title: "Hip", step: 1, stepCount: 3 },
      { id: "c-1", title: "Hip", step: 2, stepCount: 3 },
      { id: "c-1", title: "Hip", step: 3, stepCount: 3 },
      null,
    ]);
  });

  it("carries the case study onto each question's row, and scores as before", () => {
    const report = buildSessionReport({
      items: inCaseStudies(items, places),
      participants: [{ id: "p", displayName: "Ava", joinedAt: "2026-09-22T10:00:01Z" }],
      responses: [
        { participantId: "p", itemPosition: 1, points: 1, maxPoints: 1 },
        { participantId: "p", itemPosition: 3, points: 0, maxPoints: 1 },
      ],
    });
    expect(report.items.map((row) => row.caseStudy?.step ?? null)).toEqual([null, 1, 2, 3, null]);
    expect(report.students[0]).toMatchObject({ points: 1, possible: 2, answered: 2 });
  });

  it("groups rows into runs: loose stretches, and each case study's steps under it", () => {
    const groups = groupByCaseStudy(inCaseStudies(items, places));
    expect(groups.map((group) => [group.caseStudy?.title ?? null, group.items.length])).toEqual([
      [null, 1],
      ["Hip", 3],
      [null, 1],
    ]);
  });

  it("keeps the same case study played twice in a row as two groups", () => {
    const twice = inCaseStudies(items.slice(0, 4), [
      { caseStudyId: "c-1", title: "Hip", firstPosition: 1, stepCount: 2 },
      { caseStudyId: "c-1", title: "Hip", firstPosition: 3, stepCount: 2 },
    ]);
    expect(groupByCaseStudy(twice).map((group) => group.items.length)).toEqual([2, 2]);
  });
});

describe("summarizeReport (#565)", () => {
  it("averages the students' percents and names the lowest-scoring question", () => {
    const summary = summarizeReport(report);
    const percents = report.students.flatMap((s) => (s.percent === null ? [] : [s.percent]));
    expect(summary.classAverage).toBeCloseTo(
      percents.reduce((sum, p) => sum + p, 0) / percents.length,
    );
    const lowest = Math.min(
      ...report.items.flatMap((item) => (item.meanPercent === null ? [] : [item.meanPercent])),
    );
    expect(summary.hardest?.meanPercent).toBe(lowest);
  });

  it("has nothing to say about a room nobody joined", () => {
    expect(summarizeReport(buildSessionReport({ ...REPORT_FIXTURE, participants: [] }))).toEqual({
      classAverage: null,
      hardest: null,
    });
  });

  it("takes the first of two equally hard questions", () => {
    const tied = buildSessionReport({
      items: [
        { position: 1, itemId: "a", ref: "a", type: null, cjmmStep: null },
        { position: 2, itemId: "b", ref: "b", type: null, cjmmStep: null },
      ],
      participants: [{ id: "p", displayName: "Ada", joinedAt: "2026-01-01T00:00:00Z" }],
      responses: [
        { participantId: "p", itemPosition: 1, points: 0, maxPoints: 1 },
        { participantId: "p", itemPosition: 2, points: 0, maxPoints: 1 },
      ],
    });
    expect(summarizeReport(tied).hardest?.position).toBe(1);
  });
});

describe("questionLabel (#565)", () => {
  it("names a question by its number, item type and clinical judgment step", () => {
    expect(questionLabel({ position: 3, type: "multiple_response", cjmmStep: 1 })).toBe(
      "Q3 · Extended Multiple Response · Recognize Cues",
    );
    expect(questionLabel({ position: 1, type: "bowtie", cjmmStep: 5 })).toBe(
      "Q1 · Bowtie · Take Action",
    );
  });

  it("leaves out a part it does not know", () => {
    expect(questionLabel({ position: 4, type: "dropdown_cloze", cjmmStep: null })).toBe(
      "Q4 · Drop-Down Cloze",
    );
    expect(questionLabel({ position: 2, type: null, cjmmStep: 6 })).toBe("Q2 · Evaluate Outcomes");
    expect(questionLabel({ position: 5, type: "not_a_type", cjmmStep: null })).toBe("Q5");
  });

  it("leaves the step out for a table that has a Step column", () => {
    expect(
      questionLabel({ position: 3, type: "multiple_response", cjmmStep: 1 }, { withStep: false }),
    ).toBe("Q3 · Extended Multiple Response");
  });

  it("names a step by its number and name, or a dash for none", () => {
    expect(stepLabel(6)).toBe("6 · Evaluate Outcomes");
    expect(stepLabel(1)).toBe("1 · Recognize Cues");
    expect(stepLabel(null)).toBe("–");
  });

  it("never uses the internal ref, which stays in the CSV", () => {
    const [first] = report.items;
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(questionLabel(first)).toBe("Q1 · Multiple Choice · Recognize Cues");
    expect(questionLabel(first)).not.toContain(first.ref);
  });

  it("gives the bare number for a narrow column", () => {
    expect(questionNumber({ position: 12 })).toBe("Q12");
  });
});

describe("byScore (#565)", () => {
  const row = (name: string, percent: number | null) => ({
    participantId: name,
    displayName: name,
    scores: [],
    answered: 0,
    points: 0,
    possible: 0,
    percent,
  });

  it("puts the highest percent first and anyone without one last, keeping ties in order", () => {
    expect(
      byScore([row("A", 50), row("B", null), row("C", 90), row("D", 50), row("E", null)]).map(
        (student) => student.displayName,
      ),
    ).toEqual(["C", "A", "D", "B", "E"]);
  });
});

describe("markOfScore", () => {
  it("marks an answer full, partial or none, and no answer as null", () => {
    expect(markOfScore({ points: 2, maxPoints: 2 })).toBe("full");
    expect(markOfScore({ points: 1, maxPoints: 2 })).toBe("partial");
    expect(markOfScore({ points: 0, maxPoints: 2 })).toBe("none");
    expect(markOfScore(null)).toBeNull();
  });
});
