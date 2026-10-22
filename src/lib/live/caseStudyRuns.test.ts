import { describe, expect, it } from "vitest";
import { sampleEhr } from "@/lib/ngn/fixtures";
import { parseCaseStudyRuns, runAt, type CaseStudyRun } from "./caseStudyRuns";

const A = "00000000-0000-4000-8000-0000000000c1";
const B = "00000000-0000-4000-8000-0000000000c2";

/** One entry as `sessions.case_study_records` stores it. */
function stored(id: string, first: number, count = 6, record: unknown = sampleEhr) {
  return {
    case_study_id: id,
    title: `Case ${id.slice(-1)}`,
    first_position: first,
    step_count: count,
    record,
  };
}

describe("parseCaseStudyRuns (#469)", () => {
  it("reads each case study a quiz session plays, with its record parsed", () => {
    const runs = parseCaseStudyRuns([stored(A, 2), stored(B, 9, 6, null)]);
    expect(runs).toEqual<CaseStudyRun[]>([
      { caseStudyId: A, title: "Case 1", firstPosition: 2, stepCount: 6, record: sampleEhr },
      { caseStudyId: B, title: "Case 2", firstPosition: 9, stepCount: 6, record: null },
    ]);
  });

  it("is empty for a session with none: a loose-question quiz, a case study, an old row", () => {
    expect(parseCaseStudyRuns(null)).toEqual([]);
    expect(parseCaseStudyRuns(undefined)).toEqual([]);
    expect(parseCaseStudyRuns({ not: "a list" })).toEqual([]);
    expect(parseCaseStudyRuns([])).toEqual([]);
  });

  it("drops what the record schema does not know, and reads a record it cannot parse as none", () => {
    const [leaky] = parseCaseStudyRuns([stored(A, 1, 6, { ...sampleEhr, answerKey: "x" })]);
    expect(JSON.stringify(leaky)).not.toContain("answerKey");
    const [broken] = parseCaseStudyRuns([stored(A, 1, 6, { patientHeader: "nope" })]);
    expect(broken?.record).toBeNull();
  });

  it("skips an entry it cannot place, and keeps the rest in set order", () => {
    const runs = parseCaseStudyRuns([
      stored(B, 8),
      { ...stored(A, 0) },
      { ...stored(A, 1), step_count: 7 },
      { ...stored(A, 1), case_study_id: 4 },
      "junk",
      stored(A, 1),
    ]);
    expect(runs.map((run) => [run.caseStudyId, run.firstPosition])).toEqual([
      [A, 1],
      [B, 8],
    ]);
  });

  it("never lets two runs claim one position: the earlier one wins", () => {
    const runs = parseCaseStudyRuns([stored(A, 1), stored(B, 4)]);
    expect(runs.map((run) => run.caseStudyId)).toEqual([A]);
  });
});

describe("runAt (#469)", () => {
  const runs = parseCaseStudyRuns([stored(A, 2), stored(B, 9, 3)]);

  it("names the case study and the step a position is at, step 1 at its first position", () => {
    expect(runAt(runs, 2)).toMatchObject({ run: { caseStudyId: A }, step: 1 });
    expect(runAt(runs, 7)).toMatchObject({ run: { caseStudyId: A }, step: 6 });
    expect(runAt(runs, 9)).toMatchObject({ run: { caseStudyId: B }, step: 1 });
    expect(runAt(runs, 11)).toMatchObject({ run: { caseStudyId: B }, step: 3 });
  });

  it("is null on a loose question, before the room starts, and past the end", () => {
    expect(runAt(runs, 1)).toBeNull();
    expect(runAt(runs, 8)).toBeNull();
    expect(runAt(runs, 12)).toBeNull();
    expect(runAt(runs, null)).toBeNull();
    expect(runAt([], 3)).toBeNull();
  });
});
