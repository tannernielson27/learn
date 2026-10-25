import { describe, expect, it } from "vitest";
import { PROGRESS_FIXTURE } from "./classProgressFixture";
import { buildClassProgress } from "./progress";
import { classProgressCsv, classProgressCsvFilename } from "./progressCsv";

const lines = (csv: string) => csv.split("\r\n").filter((line) => line !== "");

describe("classProgressCsv", () => {
  const csv = classProgressCsv(buildClassProgress(PROGRESS_FIXTURE));

  it("has one column per activity, oldest first, between the student and the totals", () => {
    expect(lines(csv)[0]).toBe(
      [
        "Student",
        "Email",
        "Live session: Fluid balance warm-up (2026-10-06)",
        "Live session: Cardiac assessment (2026-10-13)",
        "Assignment: Week 6: Fluid and electrolytes (closes 2026-10-19)",
        "Live session: Heart failure review (2026-10-20)",
        "Assignment: Week 8: Heart failure case study (closes 2026-10-29)",
        "Assignment: Week 9: Respiratory (closes 2026-11-05)",
        "Live sessions attended",
        "Overall percent",
        "Membership",
      ].join(","),
    );
  });

  it("writes a percent as a number and says what happened instead of leaving a cell blank", () => {
    expect(lines(csv)[2]).toBe(
      "Kai Ortiz,kai.ortiz@example.test,60,Absent,52,45,Not started,Not open,2 of 3,52.33,member",
    );
    expect(lines(csv)[4]).toBe(
      "sam.lee@example.test,sam.lee@example.test,Absent,Absent,Missed,Absent,Not started,Not open,0 of 3,,member",
    );
  });

  it("puts the removed students after the class", () => {
    expect(lines(csv)).toHaveLength(6);
    expect(lines(csv)[5]).toMatch(/^Jordan Blake,.*,removed$/);
  });

  it("keeps a typed name from running as a formula", () => {
    const progress = buildClassProgress({
      rows: PROGRESS_FIXTURE.rows.map((row) => ({ ...row, name: "=HYPERLINK(1)" })),
      steps: [],
    });
    expect(lines(classProgressCsv(progress))[1]?.startsWith("'=HYPERLINK(1)")).toBe(true);
  });

  it("keeps a typed name behind leading whitespace from running as a formula", () => {
    const progress = buildClassProgress({
      rows: PROGRESS_FIXTURE.rows.map((row) => ({ ...row, name: " =HYPERLINK(1)" })),
      steps: [],
    });
    expect(lines(classProgressCsv(progress))[1]?.startsWith("' =HYPERLINK(1)")).toBe(true);
  });
});

describe("classProgressCsvFilename", () => {
  it("names the class and the day, safely", () => {
    expect(
      classProgressCsvFilename('NUR 310 "Adult" Health', new Date("2026-10-27T15:00:00Z")),
    ).toBe("nur-310-adult-health-progress-2026-10-27.csv");
  });
});
