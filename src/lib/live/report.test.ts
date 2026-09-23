import { describe, expect, it } from "vitest";
import { buildSessionReport, type SessionReportInput } from "./report";
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
