import { describe, expect, it } from "vitest";
import {
  buildAssignmentReport,
  pickBestAttempt,
  STUDENT_STATUS_LABEL,
  type AssignmentReportInput,
  type ReportAttemptInput,
} from "./report";

const ITEM_A = "00000000-0000-0000-0000-0000000000a1";
const ITEM_B = "00000000-0000-0000-0000-0000000000a2";
const ITEM_C = "00000000-0000-0000-0000-0000000000a3";

const attempt = (overrides: Partial<ReportAttemptInput>): ReportAttemptInput => ({
  studentId: "s-ava",
  id: "att-1",
  number: 1,
  submittedAt: "2026-09-23T10:00:00Z",
  score: 1,
  maxScore: 3,
  marks: [],
  ...overrides,
});

/** Ava tried twice and did better first; Ben is mid-attempt; Cleo never started; Dev tied. */
const INPUT: AssignmentReportInput = {
  released: true,
  items: [
    { position: 1, itemId: ITEM_A, ref: "mc-vitals", type: "multiple_choice", cjmmStep: 1 },
    { position: 2, itemId: ITEM_B, ref: "mr-assess", type: "multiple_response", cjmmStep: 1 },
    { position: 3, itemId: ITEM_C, ref: "untagged", type: "multiple_choice", cjmmStep: null },
  ],
  students: [
    { id: "s-dev", displayName: "Dev" },
    { id: "s-ava", displayName: "Ava" },
    { id: "s-cleo", displayName: "Cleo" },
    { id: "s-ben", displayName: "Ben" },
  ],
  attempts: [
    attempt({
      id: "ava-1",
      number: 1,
      score: 3,
      maxScore: 4,
      marks: [
        { itemId: ITEM_A, points: 1, maxPoints: 1 },
        { itemId: ITEM_B, points: 2, maxPoints: 2 },
      ],
    }),
    attempt({
      id: "ava-2",
      number: 2,
      score: 1,
      maxScore: 4,
      marks: [{ itemId: ITEM_A, points: 1, maxPoints: 1 }],
    }),
    attempt({
      studentId: "s-ben",
      id: "ben-1",
      number: 1,
      submittedAt: null,
      score: null,
      maxScore: null,
      marks: null,
    }),
    attempt({
      studentId: "s-dev",
      id: "dev-1",
      number: 1,
      score: 2,
      maxScore: 4,
      marks: [
        { itemId: ITEM_A, points: 0, maxPoints: 1 },
        { itemId: ITEM_B, points: 2, maxPoints: 2 },
      ],
    }),
    attempt({
      studentId: "s-dev",
      id: "dev-2",
      number: 2,
      score: 2,
      maxScore: 4,
      marks: [
        { itemId: ITEM_A, points: 1, maxPoints: 1 },
        { itemId: ITEM_B, points: 1, maxPoints: 2 },
      ],
    }),
  ],
};

const report = buildAssignmentReport(INPUT);
const student = (id: string) => report.students.find((row) => row.studentId === id);

describe("pickBestAttempt", () => {
  it("keeps the earlier attempt when a later one scores lower", () => {
    expect(pickBestAttempt(INPUT.attempts.filter((a) => a.studentId === "s-ava"))?.id).toBe(
      "ava-1",
    );
  });

  it("breaks a tie in favour of the earlier attempt, whatever order the rows come in", () => {
    const dev = INPUT.attempts.filter((a) => a.studentId === "s-dev");
    expect(pickBestAttempt(dev)?.id).toBe("dev-1");
    expect(pickBestAttempt([...dev].reverse())?.id).toBe("dev-1");
  });

  it("takes a later attempt that scores higher", () => {
    const better = [
      attempt({ id: "one", number: 1, score: 1 }),
      attempt({ id: "two", number: 2, score: 2 }),
    ];
    expect(pickBestAttempt(better)?.id).toBe("two");
  });

  it("never picks an attempt that is still open or has no score", () => {
    expect(
      pickBestAttempt([
        attempt({ id: "open", number: 2, submittedAt: null, score: null }),
        attempt({ id: "unscored", number: 3, score: null }),
        attempt({ id: "done", number: 1, score: 0 }),
      ])?.id,
    ).toBe("done");
    expect(pickBestAttempt([attempt({ submittedAt: null, score: null })])).toBeNull();
    expect(pickBestAttempt([])).toBeNull();
  });
});

describe("buildAssignmentReport: students", () => {
  it("has a row per student on the roster, by name", () => {
    expect(report.students.map((row) => row.displayName)).toEqual(["Ava", "Ben", "Cleo", "Dev"]);
  });

  it("says who has not started, who is in the middle of an attempt and who submitted", () => {
    expect(student("s-ava")?.status).toBe("submitted");
    expect(student("s-ben")?.status).toBe("in_progress");
    expect(student("s-cleo")?.status).toBe("not_started");
    expect(STUDENT_STATUS_LABEL.in_progress).toBe("In progress");
  });

  it("is in progress while a later attempt is open, even with one submitted", () => {
    const retrying = buildAssignmentReport({
      ...INPUT,
      attempts: [
        ...INPUT.attempts,
        attempt({ id: "ava-3", number: 3, submittedAt: null, score: null, marks: null }),
      ],
    });
    const ava = retrying.students.find((row) => row.studentId === "s-ava");
    expect(ava).toMatchObject({ status: "in_progress", attemptsUsed: 3 });
    expect(ava?.best?.attemptNumber).toBe(1);
  });

  it("counts attempts used, open ones included", () => {
    expect(student("s-ava")?.attemptsUsed).toBe(2);
    expect(student("s-ben")?.attemptsUsed).toBe(1);
    expect(student("s-cleo")?.attemptsUsed).toBe(0);
  });

  it("reports the best attempt's own total, not the last one's", () => {
    expect(student("s-ava")?.best).toEqual({
      attemptNumber: 1,
      score: 3,
      maxScore: 4,
      percent: 75,
    });
    expect(student("s-dev")?.best?.attemptNumber).toBe(1);
    expect(student("s-ben")?.best).toBeNull();
  });

  it("puts the best attempt's marks under each item, empty where it was not answered", () => {
    expect(student("s-ava")?.scores).toEqual([
      { points: 1, maxPoints: 1 },
      { points: 2, maxPoints: 2 },
      null,
    ]);
    expect(student("s-dev")?.scores).toEqual([
      { points: 0, maxPoints: 1 },
      { points: 2, maxPoints: 2 },
      null,
    ]);
    expect(student("s-cleo")?.scores).toEqual([null, null, null]);
  });

  it("has no percent when the best attempt was worth nothing", () => {
    const empty = buildAssignmentReport({
      ...INPUT,
      attempts: [attempt({ score: 0, maxScore: 0, marks: [] })],
    });
    expect(empty.students.find((row) => row.studentId === "s-ava")?.best?.percent).toBeNull();
  });

  it("ignores attempts and marks that do not belong to the roster or the set", () => {
    const stray = buildAssignmentReport({
      ...INPUT,
      attempts: [
        attempt({ studentId: "s-gone", id: "gone-1" }),
        attempt({ marks: [{ itemId: "not-in-set", points: 1, maxPoints: 1 }] }),
      ],
    });
    expect(stray.students).toHaveLength(4);
    expect(stray.students.find((row) => row.studentId === "s-ava")?.scores).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("counts each status", () => {
    expect(report.counts).toEqual({ notStarted: 1, inProgress: 1, submitted: 2 });
  });
});

describe("buildAssignmentReport: items and steps", () => {
  it("scores each item from each student's best attempt only", () => {
    const [first, second, third] = report.items;
    // Ava 1/1 and Dev 0/1 on their best attempts; Ava's second attempt is not counted.
    expect(first).toMatchObject({ responded: 2, full: 1, none: 1, meanPoints: 0.5 });
    expect(second).toMatchObject({ responded: 2, full: 2, meanPercent: 100 });
    expect(third).toMatchObject({ responded: 0, meanPercent: null });
  });

  it("adds the percent of answers that were fully correct", () => {
    expect(report.items.map((item) => item.percentCorrect)).toEqual([50, 100, null]);
  });

  it("rolls items up by CJMM step, leaving untagged items out", () => {
    expect(report.steps).toEqual([
      expect.objectContaining({ step: 1, itemCount: 2, responded: 4, meanPercent: 75 }),
    ]);
  });
});

describe("buildAssignmentReport: before the close", () => {
  const open = buildAssignmentReport({ ...INPUT, released: false });

  it("keeps progress: status and attempts used", () => {
    expect(open.released).toBe(false);
    expect(open.students.map((row) => [row.displayName, row.status, row.attemptsUsed])).toEqual([
      ["Ava", "submitted", 2],
      ["Ben", "in_progress", 1],
      ["Cleo", "not_started", 0],
      ["Dev", "submitted", 2],
    ]);
  });

  it("carries no score anywhere, even when the rows it was given had one", () => {
    expect(open.students.every((row) => row.best === null)).toBe(true);
    expect(open.students.every((row) => row.scores.every((score) => score === null))).toBe(true);
    expect(open.items.every((item) => item.responded === 0 && item.percentCorrect === null)).toBe(
      true,
    );
    expect(open.steps.every((step) => step.meanPercent === null)).toBe(true);
    expect(JSON.stringify(open)).not.toMatch(/"points":\d|"score":\d/);
  });

  it("does not modify its input", () => {
    const copy = structuredClone(INPUT);
    buildAssignmentReport(INPUT);
    expect(INPUT).toEqual(copy);
  });
});
