import { describe, expect, it } from "vitest";
import { PROGRESS_FIXTURE, PROGRESS_FIXTURE_REMOVED } from "./classProgressFixture";
import { buildClassProgress } from "./progress";
import { studentProgress, weakestStepsFirst } from "./studentProgress";

const progress = buildClassProgress(PROGRESS_FIXTURE);
const KAI = "00000000-0000-4000-8000-0000000000a2";

describe("studentProgress", () => {
  it("is null for anyone who is not in the class's progress", () => {
    expect(studentProgress(progress, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
  });

  it("finds a removed student too, so their teacher can still open their work", () => {
    expect(studentProgress(progress, PROGRESS_FIXTURE_REMOVED.profileId)?.student.membership).toBe(
      "removed",
    );
  });

  it("lists every live session and assignment, newest first, with its own cell", () => {
    const kai = studentProgress(progress, KAI);
    expect(kai?.timeline.map((entry) => entry.activity.title)).toEqual([
      "Week 9: Respiratory",
      "Week 8: Heart failure case study",
      "Heart failure review",
      "Week 6: Fluid and electrolytes",
      "Cardiac assessment",
      "Fluid balance warm-up",
    ]);
    expect(kai?.timeline.map((entry) => entry.cell.percent)).toEqual([
      null,
      null,
      45,
      52,
      null,
      60,
    ]);
    expect(kai?.sessionsEnded).toBe(3);
  });

  it("links an ended live session to its report and an assignment to its report", () => {
    const [respiratory, , review] = studentProgress(progress, KAI)?.timeline ?? [];
    expect(review).toMatchObject({
      href: "/live/00000000-0000-4000-8000-0000000000e3/report",
      linkLabel: "Open the live session report",
    });
    expect(respiratory).toMatchObject({
      href: "/author/assignments/00000000-0000-4000-8000-0000000000b3/report",
      linkLabel: "Open the assignment report",
    });
  });

  it("links a live session that is still open to the live session", () => {
    const running = buildClassProgress({
      rows: PROGRESS_FIXTURE.rows.map((row) =>
        row.activityId === "00000000-0000-4000-8000-0000000000e3"
          ? { ...row, state: "running" }
          : row,
      ),
      steps: [],
    });
    const entry = studentProgress(running, KAI)?.timeline.find(
      (each) => each.activity.id === "00000000-0000-4000-8000-0000000000e3",
    );
    expect(entry).toMatchObject({
      href: "/live/00000000-0000-4000-8000-0000000000e3",
      linkLabel: "Open the live session",
    });
  });

  it("puts the weakest steps first", () => {
    expect(studentProgress(progress, KAI)?.steps.map((s) => s.step)).toEqual([2, 4, 3, 1]);
  });
});

describe("weakestStepsFirst", () => {
  it("breaks a tie by step and puts a step with no percent last", () => {
    const step = (n: 1 | 2 | 3 | 4, meanPercent: number | null) => ({
      step: n,
      label: `S${n}`,
      answered: 1,
      meanPercent,
    });
    expect(
      weakestStepsFirst([step(4, null), step(3, 50), step(2, 50), step(1, null)]).map(
        (s) => s.step,
      ),
    ).toEqual([2, 3, 1, 4]);
  });
});
