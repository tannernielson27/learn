import { describe, expect, it } from "vitest";
import { podiumOfReport } from "./podium";
import { buildSessionReport, type SessionReportInput } from "./report";

/**
 * The report and the projector's podium after the edge cases of a live class (2026-10-27): a
 * session the teacher ended in the middle of a question, and a member who joined as a guest and
 * then again signed in (ADR 0013 decision 2), who is two participants.
 */

const ITEMS: SessionReportInput["items"] = [
  { position: 1, itemId: "i-1", ref: "mc-1", type: "multiple_choice", cjmmStep: 1 },
  { position: 2, itemId: "i-2", ref: "mc-2", type: "multiple_choice", cjmmStep: 2 },
  { position: 3, itemId: "i-3", ref: "mc-3", type: "multiple_choice", cjmmStep: 3 },
];

describe("a live session ended in the middle of question 2", () => {
  const input: SessionReportInput = {
    items: ITEMS,
    participants: [
      { id: "p-ava", displayName: "Ava", joinedAt: "2026-10-27T10:00:01Z" },
      { id: "p-ben", displayName: "Ben", joinedAt: "2026-10-27T10:00:02Z" },
    ],
    // Both answered question 1; only Ava's answer to question 2 landed before the end.
    responses: [
      { participantId: "p-ava", itemPosition: 1, points: 1, maxPoints: 1 },
      { participantId: "p-ben", itemPosition: 1, points: 0, maxPoints: 1 },
      { participantId: "p-ava", itemPosition: 2, points: 1, maxPoints: 1 },
    ],
  };

  it("builds the report with the half-answered question and the unreached one", () => {
    const report = buildSessionReport(input);
    expect(report.items.map((row) => row.unanswered)).toEqual([0, 1, 2]);
    expect(report.students.map((row) => [row.displayName, row.points])).toEqual([
      ["Ava", 2],
      ["Ben", 0],
    ]);
  });

  it("puts only the student with points on the podium", () => {
    const podium = podiumOfReport(buildSessionReport(input));
    expect(podium?.entries.map((entry) => entry.displayName)).toEqual(["Ava"]);
  });
});

describe("a member who was a guest first and then joined signed in", () => {
  it("is two participants, so the podium can name them twice (ADR 0013 decision 2)", () => {
    const report = buildSessionReport({
      items: ITEMS,
      participants: [
        { id: "p-gia-guest", displayName: "Gia", joinedAt: "2026-10-27T10:00:01Z" },
        { id: "p-gia", displayName: "Gia Park", joinedAt: "2026-10-27T10:05:00Z" },
      ],
      responses: [
        { participantId: "p-gia-guest", itemPosition: 1, points: 1, maxPoints: 1 },
        { participantId: "p-gia", itemPosition: 2, points: 1, maxPoints: 1 },
        { participantId: "p-gia", itemPosition: 3, points: 1, maxPoints: 1 },
      ],
    });
    expect(report.students).toHaveLength(2);
    expect(podiumOfReport(report)?.entries.map((entry) => entry.displayName)).toEqual([
      "Gia Park",
      "Gia",
    ]);
  });
});
