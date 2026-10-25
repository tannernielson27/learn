import { describe, expect, it } from "vitest";
import { rowOf, totalsOf } from "@/lib/assignments/resultsSummary";
import { LIVE_HISTORY_FIXTURE, liveResultEntriesFixture } from "./liveResultsFixture";

describe("the live results fixtures", () => {
  it("lists three ended sessions, most recently ended first", () => {
    const ended = LIVE_HISTORY_FIXTURE.map((row) => row.closedAt ?? "");
    expect(ended).toEqual([...ended].sort().reverse());
    expect(LIVE_HISTORY_FIXTURE.map((row) => row.classId === null)).toEqual([false, true, false]);
  });

  it("gives each listed session a percent that matches its points", () => {
    for (const row of LIVE_HISTORY_FIXTURE) {
      expect(row.percent).toBeCloseTo((row.points / row.possible) * 100);
      expect(row.answered).toBeLessThanOrEqual(row.questionCount);
    }
  });

  it("is a session that reached questions 1, 2 and 4: one right, one partly, one blank", () => {
    const entries = liveResultEntriesFixture();
    expect(entries.map((entry) => entry.position)).toEqual([1, 2, 4]);
    const rows = entries.map((entry) =>
      rowOf(
        entry.rowId,
        entry.position,
        entry.item,
        entry.outcome.kind === "answered"
          ? { points: entry.outcome.score.points, maxPoints: entry.outcome.score.maxPoints }
          : "unanswered",
      ),
    );
    expect(rows.map((row) => row.verdict)).toEqual(["full", "partial", "unanswered"]);
    expect(totalsOf(rows).missed).toBe(2);
  });
});
