import { describe, expect, it } from "vitest";
import { buildSessionReport, inCaseStudies } from "./report";
import { REPORT_FIXTURE } from "./reportFixture";
import { reportCsvFilename, sessionReportCsv } from "./reportCsv";

const lines = sessionReportCsv(buildSessionReport(REPORT_FIXTURE)).split("\r\n");

/** The question columns (#563): a header for each, then the same excerpts on every row. */
const QUESTION_HEADS = ",Q1 question,Q2 question,Q3 question,Q4 question";
const QUESTION_CELLS =
  ",Which of the client's vital signs should the nurse report t…" +
  ",Select the findings that need follow-up." +
  ',"Complete the diagram: the condition, two actions, and two p…",';

describe("sessionReportCsv", () => {
  // Every column a teacher's spreadsheet may already read keeps its header, its place and its
  // values: the file before #563 is the start of every line of the file now.
  it("heads a column per item, then the totals, then each question's text", () => {
    expect(lines[0]).toBe(
      "Student,Q1 mc-vitals,Q2 mr-assess,Q3 bowtie-act,Q4 untagged,Points,Possible,Percent" +
        QUESTION_HEADS,
    );
  });

  it("writes one row per student with an empty cell for an unanswered item", () => {
    expect(lines).toContain(`Ava,1,3,1,,5,6,83.33${QUESTION_CELLS}`);
    expect(lines).toContain(`Ben,0,2,,,2,6,33.33${QUESTION_CELLS}`);
    expect(lines).toContain(`Dev,,,,,0,6,0${QUESTION_CELLS}`);
  });

  it("neutralises a display name written as a spreadsheet formula", () => {
    expect(lines).toContain(`'=cmd|' /C calc'!A0,1,,,,1,6,16.67${QUESTION_CELLS}`);
  });

  it("leaves a question's text empty where it was not read, and neutralises a formula in it", () => {
    const csv = sessionReportCsv(
      buildSessionReport({
        items: [
          { position: 1, itemId: "i", ref: "r", type: "bowtie", cjmmStep: null },
          { position: 2, itemId: "j", ref: "s", stem: "=1+1", type: "bowtie", cjmmStep: null },
        ],
        participants: [{ id: "p", displayName: "P", joinedAt: "2026-09-22T10:00:00Z" }],
        responses: [],
      }),
    ).split("\r\n");
    expect(csv[0]).toBe("Student,Q1 r,Q2 s,Points,Possible,Percent,Q1 question,Q2 question");
    expect(csv[1]).toBe("P,,,0,0,,,'=1+1");
  });

  it("has a header, a row per student and a final CRLF", () => {
    expect(lines).toHaveLength(1 + REPORT_FIXTURE.participants.length + 1);
    expect(lines.at(-1)).toBe("");
  });

  it("leaves the percent empty when nothing was answered", () => {
    const empty = sessionReportCsv(buildSessionReport({ ...REPORT_FIXTURE, responses: [] }));
    expect(empty.split("\r\n")).toContain(`Ava,,,,,0,0,${QUESTION_CELLS}`);
  });

  it("rounds points to two places", () => {
    const thirds = sessionReportCsv(
      buildSessionReport({
        items: [{ position: 1, itemId: "i", ref: "r", type: "bowtie", cjmmStep: null }],
        participants: [{ id: "p", displayName: "P", joinedAt: "2026-09-22T10:00:00Z" }],
        responses: [{ participantId: "p", itemPosition: 1, points: 1 / 3, maxPoints: 1 }],
      }),
    );
    expect(thirds.split("\r\n")[1]).toBe("P,0.33,0.33,1,33.33,");
  });
});

describe("reportCsvFilename", () => {
  it("names the file after the session and the day it closed", () => {
    expect(reportCsvFilename("Cardiac Unit: Week 3", "2026-09-22T15:04:05Z")).toBe(
      "cardiac-unit-week-3-2026-09-22.csv",
    );
  });

  it("keeps only safe characters, so the name cannot break the header it goes in", () => {
    expect(reportCsvFilename('a"; filename=evil.exe\r\n', null)).toBe(
      "a-filename-evil-exe-session-report.csv",
    );
  });

  it("falls back when nothing safe is left of the title", () => {
    expect(reportCsvFilename("---", null)).toBe("session-session-report.csv");
  });

  it("keeps a long title to a sensible length", () => {
    expect(reportCsvFilename("x".repeat(300), null).length).toBeLessThanOrEqual(80);
  });
});

describe("sessionReportCsv for a quiz that played a case study in place (#469)", () => {
  it("names the case study and the step in each step's column", () => {
    const items = inCaseStudies(REPORT_FIXTURE.items, [
      { caseStudyId: "c-1", title: "Hip, day 1", firstPosition: 2, stepCount: 2 },
    ]);
    const [header] = sessionReportCsv(buildSessionReport({ ...REPORT_FIXTURE, items })).split(
      "\r\n",
    );
    expect(header).toBe(
      "Student,Q1 mc-vitals," +
        '"Q2 mr-assess (Case study: Hip, day 1, Step 1 of 2)",' +
        '"Q3 bowtie-act (Case study: Hip, day 1, Step 2 of 2)",' +
        "Q4 untagged,Points,Possible,Percent" +
        QUESTION_HEADS,
    );
  });
});
