import { describe, expect, it } from "vitest";
import { buildAssignmentReport, type AssignmentReportInput } from "./report";
import { assignmentReportCsv } from "./reportCsv";

const ITEM_A = "00000000-0000-0000-0000-0000000000a1";
const ITEM_B = "00000000-0000-0000-0000-0000000000a2";

const INPUT: AssignmentReportInput = {
  released: true,
  items: [
    { position: 1, itemId: ITEM_A, ref: "mc-vitals", type: "multiple_choice", cjmmStep: 1 },
    { position: 2, itemId: ITEM_B, ref: "mr-assess", type: "multiple_response", cjmmStep: 2 },
  ],
  students: [
    { id: "s-ava", displayName: "Ava" },
    { id: "s-evil", displayName: "=cmd|' /C calc'!A0" },
    { id: "s-cleo", displayName: "Cleo, RN" },
    { id: "s-plus", displayName: "+1 555" },
  ],
  attempts: [
    {
      studentId: "s-ava",
      id: "ava-1",
      number: 1,
      submittedAt: "2026-09-23T10:00:00Z",
      score: 2.5,
      maxScore: 3,
      marks: [
        { itemId: ITEM_A, points: 1, maxPoints: 1 },
        { itemId: ITEM_B, points: 1.5, maxPoints: 2 },
      ],
    },
    {
      studentId: "s-evil",
      id: "evil-1",
      number: 1,
      submittedAt: "2026-09-23T10:00:00Z",
      score: 1,
      maxScore: 3,
      marks: [{ itemId: ITEM_A, points: 1, maxPoints: 1 }],
    },
    {
      studentId: "s-evil",
      id: "evil-2",
      number: 2,
      submittedAt: "2026-09-23T11:00:00Z",
      score: 0,
      maxScore: 3,
      marks: [],
    },
  ],
};

const lines = assignmentReportCsv(buildAssignmentReport(INPUT)).split("\r\n");

describe("assignmentReportCsv", () => {
  it("heads like the session CSV, then the attempts and the status", () => {
    expect(lines[0]).toBe(
      "Student,Q1 mc-vitals,Q2 mr-assess,Points,Possible,Percent,Attempts used,Status,Class status",
    );
  });

  it("writes each student's best attempt, with the attempts they used", () => {
    expect(lines).toContain("Ava,1,1.5,2.5,3,83.33,1,Submitted,member");
  });

  it("leaves an unanswered item empty, and every score empty for a student with none", () => {
    expect(lines).toContain("'+1 555,,,,,,0,Not started,member");
  });

  it("neutralises a display name written as a spreadsheet formula", () => {
    expect(lines).toContain("'=cmd|' /C calc'!A0,1,,1,3,33.33,2,Submitted,member");
  });

  it("quotes a display name with a comma in it", () => {
    expect(lines).toContain('"Cleo, RN",,,,,,0,Not started,member');
  });

  it("has a header, a row per student and a final CRLF", () => {
    expect(lines).toHaveLength(1 + INPUT.students.length + 1);
    expect(lines.at(-1)).toBe("");
  });

  it("lists a student removed after attempting last, with their best, marked removed (#242)", () => {
    const withRemoved = assignmentReportCsv(
      buildAssignmentReport({
        ...INPUT,
        students: [...INPUT.students, { id: "s-zed", displayName: "Aaron", membership: "removed" }],
        attempts: [
          ...INPUT.attempts,
          {
            studentId: "s-zed",
            id: "zed-1",
            number: 1,
            submittedAt: "2026-09-23T10:00:00Z",
            score: 2,
            maxScore: 3,
            marks: [{ itemId: ITEM_B, points: 2, maxPoints: 2 }],
          },
        ],
      }),
    ).split("\r\n");
    expect(withRemoved).toHaveLength(1 + INPUT.students.length + 1 + 1);
    expect(withRemoved.at(-2)).toBe("Aaron,,2,2,3,66.67,1,Submitted,removed");
  });

  it("refuses a report whose scores are not released", () => {
    expect(() => assignmentReportCsv(buildAssignmentReport({ ...INPUT, released: false }))).toThrow(
      /not released/,
    );
  });
});
