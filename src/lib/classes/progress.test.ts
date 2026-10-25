import { describe, expect, it } from "vitest";
import { CLASS_PAGE_FIXTURE_CLASS } from "./classPageFixture";
import {
  PROGRESS_FIXTURE,
  PROGRESS_FIXTURE_EMPTY,
  PROGRESS_FIXTURE_REMOVED,
} from "./classProgressFixture";
import {
  attendanceText,
  buildClassProgress,
  cellText,
  classSteps,
  heatShare,
  parseProgressSort,
  progressTabPath,
  sortStudents,
  weakestStudents,
  type ProgressCell,
  type ProgressRowInput,
} from "./progress";

const progress = buildClassProgress(PROGRESS_FIXTURE);
const names = (list: readonly { name: string }[]) => list.map((s) => s.name);
const byName = (name: string) => {
  const found = [...progress.students, ...progress.removed].find((s) => s.name === name);
  if (!found) throw new Error(`no ${name} in the fixture`);
  return found;
};

describe("buildClassProgress: the grid", () => {
  it("lists live sessions and assignments together, oldest first", () => {
    expect(progress.activities.map((a) => `${a.kind}:${a.title}`)).toEqual([
      "session:Fluid balance warm-up",
      "session:Cardiac assessment",
      "assignment:Week 6: Fluid and electrolytes",
      "session:Heart failure review",
      "assignment:Week 8: Heart failure case study",
      "assignment:Week 9: Respiratory",
    ]);
  });

  it("lists the class's members by name, and the removed student apart", () => {
    expect(names(progress.students)).toEqual([
      "Ana Reyes",
      "Kai Ortiz",
      "Priya Shah",
      "sam.lee@example.test",
    ]);
    expect(names(progress.removed)).toEqual([PROGRESS_FIXTURE_REMOVED.name]);
    expect(progress.removed[0]?.membership).toBe("removed");
  });

  it("gives every student one cell per activity, in the activities' order", () => {
    for (const student of [...progress.students, ...progress.removed]) {
      expect(student.cells.map((c) => c.activityId)).toEqual(progress.activities.map((a) => a.id));
    }
  });

  it("counts attendance over the ended live sessions only", () => {
    expect(progress.sessionsEnded).toBe(3);
    expect(progress.assignmentsOpened).toBe(2);
    expect(byName("Ana Reyes").sessionsAttended).toBe(3);
    expect(byName("Kai Ortiz").sessionsAttended).toBe(2);
    expect(byName("Priya Shah").sessionsAttended).toBe(1);
    expect(byName("sam.lee@example.test").sessionsAttended).toBe(0);
  });

  it("averages each scored activity once, and never counts an absence as nought", () => {
    expect(byName("Ana Reyes").overallPercent).toBeCloseTo((80 + 90 + 88 + 85) / 4);
    expect(byName("Kai Ortiz").overallPercent).toBeCloseTo((60 + 52 + 45) / 3);
    expect(byName("Priya Shah").overallPercent).toBe(70);
    expect(byName("Priya Shah").scoredCount).toBe(1);
    expect(byName("sam.lee@example.test").overallPercent).toBeNull();
    expect(byName("sam.lee@example.test").scoredCount).toBe(0);
  });

  it("counts submitted assignments, whether or not their scores are out", () => {
    expect(byName("Ana Reyes").assignmentsSubmitted).toBe(1);
    expect(byName("Priya Shah").assignmentsSubmitted).toBe(1);
  });

  it("keeps the database's withheld scores withheld", () => {
    const open = progress.activities.findIndex((a) => a.state === "open");
    expect(byName("Priya Shah").cells[open]).toMatchObject({ status: "submitted", percent: null });
  });

  it("reads a missing row as not attended and not started", () => {
    const [first, ...rest] = PROGRESS_FIXTURE.rows as ProgressRowInput[];
    const missing = buildClassProgress({ rows: rest, steps: [] });
    const student = missing.students.find((s) => s.profileId === first?.profileId);
    expect(student?.cells[0]).toMatchObject({ attended: false, percent: null, status: null });
    const assignmentRow = rest.find(
      (r) => r.kind === "assignment" && r.profileId === first?.profileId,
    );
    const without = buildClassProgress({
      rows: PROGRESS_FIXTURE.rows.filter((r) => r !== assignmentRow),
      steps: [],
    });
    const cell = without.students
      .find((s) => s.profileId === first?.profileId)
      ?.cells.find((c) => c.activityId === assignmentRow?.activityId);
    expect(cell).toMatchObject({ status: "not_started", attended: false });
  });

  it("is empty for a class with nothing run or assigned", () => {
    expect(buildClassProgress(PROGRESS_FIXTURE_EMPTY)).toEqual({
      activities: [],
      students: [],
      removed: [],
      sessionsEnded: 0,
      assignmentsOpened: 0,
      steps: [],
    });
  });

  it("ignores steps of anyone who is not in the rows", () => {
    const stray = buildClassProgress({
      rows: [],
      steps: [{ profileId: "x", step: 1, answered: 1, meanPercent: 10 }],
    });
    expect(stray.steps).toEqual([]);
  });
});

describe("buildClassProgress: the steps", () => {
  it("gives each student their own steps, step 1 first", () => {
    expect(byName("Kai Ortiz").steps.map((s) => [s.step, s.meanPercent])).toEqual([
      [1, 60],
      [2, 40],
      [3, 55],
      [4, 45],
    ]);
    expect(byName("Kai Ortiz").steps[1]?.label).toBe("Analyze Cues");
  });

  it("averages the members' own step percents, each member once, and leaves the removed out", () => {
    expect(
      progress.steps.map((s) => [s.step, Math.round((s.meanPercent ?? 0) * 100) / 100]),
    ).toEqual([
      [1, 75],
      [2, 63.33],
      [3, 68.33],
      [4, 66.5],
      [6, 92],
    ]);
    expect(progress.steps[0]).toMatchObject({ itemCount: 3, responded: 12 });
  });

  it("has no bar for a step nobody has a percent at", () => {
    const steps = classSteps([
      {
        ...byName("Ana Reyes"),
        steps: [{ step: 5, label: "Take Action", answered: 2, meanPercent: null }],
      },
    ]);
    expect(steps).toEqual([
      { step: 5, label: "Take Action", itemCount: 1, responded: 2, meanPercent: null },
    ]);
  });
});

describe("sorting and the weakest", () => {
  it("sorts by name", () => {
    expect(names(sortStudents([...progress.students].reverse(), "name"))).toEqual(
      names(progress.students),
    );
  });

  it("sorts by overall, lowest first, with no score last", () => {
    expect(names(sortStudents(progress.students, "overall"))).toEqual([
      "Kai Ortiz",
      "Priya Shah",
      "Ana Reyes",
      "sam.lee@example.test",
    ]);
  });

  it("breaks a tie in overall, and between two without a score, by name", () => {
    const ana = byName("Ana Reyes");
    const twin = { ...ana, profileId: "z", name: "Aaron Reyes" };
    expect(names(sortStudents([ana, twin], "overall"))).toEqual(["Aaron Reyes", "Ana Reyes"]);
    const none = [
      { ...ana, profileId: "y", name: "Zed", overallPercent: null },
      { ...ana, profileId: "x", name: "Abe", overallPercent: null },
    ];
    expect(names(sortStudents(none, "overall"))).toEqual(["Abe", "Zed"]);
  });

  it("does not change the list it is given", () => {
    const before = names(progress.students);
    sortStudents(progress.students, "overall");
    expect(names(progress.students)).toEqual(before);
  });

  it("names the lowest three with a score, lowest first", () => {
    expect(names(weakestStudents(progress.students))).toEqual([
      "Kai Ortiz",
      "Priya Shah",
      "Ana Reyes",
    ]);
    expect(names(weakestStudents(progress.students, 1))).toEqual(["Kai Ortiz"]);
    expect(weakestStudents(progress.students, -1)).toEqual([]);
  });

  it("parses the sort from the address, by name for anything else", () => {
    expect(parseProgressSort("overall")).toBe("overall");
    expect(parseProgressSort("name")).toBe("name");
    for (const value of [undefined, "", "Overall", ["overall"], "__proto__"]) {
      expect(parseProgressSort(value)).toBe("name");
    }
  });

  it("keeps the sort in the Progress tab's address", () => {
    const id = CLASS_PAGE_FIXTURE_CLASS.id;
    expect(progressTabPath(id)).toBe(`/author/classes/${id}?tab=progress`);
    expect(progressTabPath(id, "overall")).toBe(`/author/classes/${id}?tab=progress&sort=overall`);
  });
});

describe("what a cell says", () => {
  const cell = (over: Partial<ProgressCell>): ProgressCell => ({
    kind: "session",
    activityId: "a",
    attended: true,
    status: null,
    attemptNumber: null,
    percent: null,
    state: "ended",
    ...over,
  });

  it("says a percent, rounded, whenever there is one", () => {
    expect(cellText(cell({ percent: 66.666 }))).toBe("67%");
    expect(
      cellText(cell({ kind: "assignment", status: "submitted", percent: 0, state: "closed" })),
    ).toBe("0%");
  });

  it("says what happened at a live session without a score", () => {
    expect(cellText(cell({ attended: false }))).toBe("Absent");
    expect(cellText(cell({ attended: false, state: "running" }))).toBe("–");
    expect(cellText(cell({ attended: true, state: "running" }))).toBe("In progress");
    expect(cellText(cell({ attended: true }))).toBe("Joined");
  });

  it("says where an assignment stands without a score", () => {
    const assignment = (status: ProgressCell["status"], state: string) =>
      cellText(cell({ kind: "assignment", status, state, attended: status !== "not_started" }));
    expect(assignment("not_started", "scheduled")).toBe("Not open");
    expect(assignment("not_started", "open")).toBe("Not started");
    expect(assignment("not_started", "closed")).toBe("Missed");
    expect(assignment("in_progress", "open")).toBe("In progress");
    expect(assignment("submitted", "open")).toBe("Submitted");
    expect(assignment("submitted", "closed")).toBe("Submitted");
  });

  it("shades by percent, and not at all without one", () => {
    expect(heatShare(null)).toBe(0);
    expect(heatShare(50)).toBe(0.5);
    expect(heatShare(140)).toBe(1);
    expect(heatShare(-5)).toBe(0);
  });

  it("says attendance as a fraction", () => {
    expect(attendanceText(2, 3)).toBe("2 of 3");
  });
});
