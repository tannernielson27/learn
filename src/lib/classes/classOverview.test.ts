import { describe, expect, it } from "vitest";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import { studentCountLabel, summarizeClass } from "./classOverview";
import {
  CLASS_PAGE_FIXTURE_ASSIGNMENTS as ASSIGNMENTS,
  CLASS_PAGE_FIXTURE_NOW as NOW,
  CLASS_PAGE_FIXTURE_ROSTER as ROSTER,
  CLASS_PAGE_FIXTURE_SHARES as SHARES,
} from "./classPageFixture";

function assignment(id: string, opensAt: string, closesAt: string): AssignmentSummary {
  return {
    id,
    classId: "c",
    title: id,
    opensAt,
    closesAt,
    maxAttempts: 1,
    shuffleOptions: false,
  };
}

describe("studentCountLabel", () => {
  it("says one student, and any other number as students", () => {
    expect(studentCountLabel(0)).toBe("0 students");
    expect(studentCountLabel(1)).toBe("1 student");
    expect(studentCountLabel(12)).toBe("12 students");
  });
});

describe("summarizeClass", () => {
  it("counts the fixture's students, assignments by state and practice shares", () => {
    const summary = summarizeClass({
      roster: ROSTER,
      assignments: ASSIGNMENTS,
      shares: SHARES,
      now: NOW,
    });
    expect(summary.students).toBe(4);
    expect(summary.assignments).toEqual({ open: 1, scheduled: 1, closed: 1 });
    expect(summary.practice).toBe(1);
  });

  it("puts the open assignment first, ahead of one that has not opened", () => {
    const summary = summarizeClass({
      roster: ROSTER,
      assignments: ASSIGNMENTS,
      shares: SHARES,
      now: NOW,
    });
    expect(summary.focus?.state).toBe("open");
    expect(summary.focus?.assignment.title).toBe("Week 8: Heart failure case study");
  });

  it("with two open, picks the one that closes first", () => {
    const summary = summarizeClass({
      roster: [],
      assignments: [
        assignment("later", "2026-10-20T00:00:00Z", "2026-11-30T00:00:00Z"),
        assignment("sooner", "2026-10-25T00:00:00Z", "2026-10-28T00:00:00Z"),
      ],
      shares: [],
      now: NOW,
    });
    expect(summary.focus).toMatchObject({ state: "open", assignment: { id: "sooner" } });
  });

  it("with none open, picks the next to open", () => {
    const summary = summarizeClass({
      roster: [],
      assignments: [
        assignment("closed", "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"),
        assignment("far", "2026-12-01T00:00:00Z", "2026-12-02T00:00:00Z"),
        assignment("next", "2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z"),
      ],
      shares: [],
      now: NOW,
    });
    expect(summary.focus).toMatchObject({ state: "scheduled", assignment: { id: "next" } });
  });

  it("has nothing to put first when every assignment has closed, or there are none", () => {
    const closedOnly = summarizeClass({
      roster: [],
      assignments: [assignment("closed", "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z")],
      shares: [],
      now: NOW,
    });
    expect(closedOnly.focus).toBeNull();
    expect(summarizeClass({ roster: [], assignments: [], shares: [], now: NOW }).focus).toBeNull();
  });

  it("lists the latest to join first, at most three", () => {
    const summary = summarizeClass({ roster: ROSTER, assignments: [], shares: [], now: NOW });
    expect(summary.recentJoins.map((entry) => entry.email)).toEqual([
      "priya.shah@example.test",
      "sam.lee@example.test",
      "kai.ortiz@example.test",
    ]);
    // The roster it was given keeps its own order.
    expect(ROSTER[0]?.email).toBe("ana.reyes@example.test");
  });

  it("keeps a part that could not be read as unknown rather than as zero", () => {
    const summary = summarizeClass({ roster: null, assignments: null, shares: null, now: NOW });
    expect(summary.students).toBeNull();
    expect(summary.assignments).toBeNull();
    expect(summary.practice).toBeNull();
    expect(summary.focus).toBeNull();
    expect(summary.recentJoins).toEqual([]);
  });
});
