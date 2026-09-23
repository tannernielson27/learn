import type { SessionReportInput } from "./report";

/**
 * One ended session, small enough to check by hand, that drives the report's unit tests and the
 * report page's component tests (#186).
 *
 * Four items: two tagged Recognize Cues (step 1), one Take Action (step 5), one untagged. Four
 * students: Ava answers everything, Ben skips item 3, Cleo answers only item 1, and Dev joined
 * but answered nothing. Item 4 was never answered by anyone, so nobody knows what it was worth.
 * The names are fictional, and one of them is written the way a student trying to break a
 * spreadsheet would write it.
 *
 *            item 1 (/1)  item 2 (/3)  item 3 (/2)  item 4 (?)
 *   Ava          1            3            1            -
 *   Ben          0            2            -            -
 *   Cleo         1            -            -            -
 *   Dev          -            -            -            -
 */
export const REPORT_FIXTURE: SessionReportInput = {
  items: [
    { position: 1, itemId: "i-1", ref: "mc-vitals", type: "multiple_choice", cjmmStep: 1 },
    { position: 2, itemId: "i-2", ref: "mr-assess", type: "multiple_response", cjmmStep: 1 },
    { position: 3, itemId: "i-3", ref: "bowtie-act", type: "bowtie", cjmmStep: 5 },
    { position: 4, itemId: "i-4", ref: "untagged", type: "dropdown_cloze", cjmmStep: null },
  ],
  participants: [
    { id: "p-ben", displayName: "Ben", joinedAt: "2026-09-22T10:00:02Z" },
    { id: "p-ava", displayName: "Ava", joinedAt: "2026-09-22T10:00:01Z" },
    { id: "p-cleo", displayName: "=cmd|' /C calc'!A0", joinedAt: "2026-09-22T10:00:03Z" },
    { id: "p-dev", displayName: "Dev", joinedAt: "2026-09-22T10:00:04Z" },
  ],
  responses: [
    { participantId: "p-ava", itemPosition: 1, points: 1, maxPoints: 1 },
    { participantId: "p-ava", itemPosition: 2, points: 3, maxPoints: 3 },
    { participantId: "p-ava", itemPosition: 3, points: 1, maxPoints: 2 },
    { participantId: "p-ben", itemPosition: 1, points: 0, maxPoints: 1 },
    { participantId: "p-ben", itemPosition: 2, points: 2, maxPoints: 3 },
    { participantId: "p-cleo", itemPosition: 1, points: 1, maxPoints: 1 },
  ],
};
