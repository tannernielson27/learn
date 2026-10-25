import { describe, expect, it } from "vitest";
import type { LiveResultSummary } from "@/lib/supabase/liveResults";
import { answeredLabel, buildLiveHistory, studentLiveResultPath } from "./liveHistory";

const SUMMARY: LiveResultSummary = {
  sessionId: "00000000-0000-4000-8000-0000000250a1",
  title: "Cardiac quiz",
  classId: "c1",
  className: "NUR 310",
  closedAt: "2026-10-27T15:00:00Z",
  questionCount: 3,
  answered: 2,
  points: 2,
  possible: 4,
  marks: [
    { position: 1, points: 1, maxPoints: 1 },
    { position: 2, points: 1, maxPoints: 3 },
    { position: 3, points: null, maxPoints: 0 },
  ],
};

describe("studentLiveResultPath", () => {
  it("is under the student's own area, never the teacher's /live", () => {
    expect(studentLiveResultPath("s1")).toBe("/learn/live/s1");
  });
});

describe("buildLiveHistory", () => {
  it("keeps the order and gives each session its score, percent and counts", () => {
    const [first, second] = buildLiveHistory([
      SUMMARY,
      { ...SUMMARY, sessionId: "s2", title: "Respiratory" },
    ]);
    expect(first).toEqual({
      id: SUMMARY.sessionId,
      title: "Cardiac quiz",
      classId: "c1",
      className: "NUR 310",
      closedAt: "2026-10-27T15:00:00Z",
      points: 2,
      possible: 4,
      percent: 50,
      answered: 2,
      questionCount: 3,
    });
    expect(second?.id).toBe("s2");
  });

  it("has no percent when nothing was worth anything", () => {
    const [row] = buildLiveHistory([{ ...SUMMARY, points: 0, possible: 0 }]);
    expect(row?.percent).toBeNull();
  });

  it("does not change what it is given", () => {
    const input = [SUMMARY];
    const copy = structuredClone(input);
    buildLiveHistory(input);
    expect(input).toEqual(copy);
  });
});

describe("answeredLabel", () => {
  it("says how many of the session's questions they answered", () => {
    expect(answeredLabel({ answered: 2, questionCount: 3 })).toBe("Answered 2 of 3 questions");
    expect(answeredLabel({ answered: 1, questionCount: 1 })).toBe("Answered 1 of 1 question");
    expect(answeredLabel({ answered: 0, questionCount: 0 })).toBe("No questions");
  });
});
