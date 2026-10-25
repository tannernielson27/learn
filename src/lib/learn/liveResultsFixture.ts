/**
 * A student's own live session results, small enough to check by hand, for the gallery's
 * screenshots (`/gallery/live/student-results`) and the unit test beside this file.
 *
 * The home list: three ended sessions, most recent first. One scored in a class the student is in,
 * one whose class has been deleted, and one where they answered nothing. The results page: one
 * session that reached questions 1, 2 and 4 (the teacher went back before ending, so question 3
 * was never put to the room): a multiple choice answered right, a select-all with one correct
 * option missed, and a multiple choice left blank. Every name is fictional.
 *
 * Scores are made by the one scoring entry point, as the server made them when the student
 * answered; nothing a student loads imports this file.
 */
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { scoreSubmission } from "@/lib/ngn/submit";
import type { LiveHistoryRow } from "./liveHistory";
import type { LiveResultEntry } from "./liveResultPage";

export const LIVE_FIXTURE_CLASS_ID = "00000000-0000-4000-8000-0000000250c1";

export const LIVE_HISTORY_FIXTURE: readonly LiveHistoryRow[] = [
  {
    id: "00000000-0000-4000-8000-0000000250a1",
    title: "Heart failure: fluid balance",
    classId: LIVE_FIXTURE_CLASS_ID,
    className: "NUR 310",
    closedAt: "2026-10-27T15:50:00Z",
    points: 4,
    possible: 6,
    percent: (4 / 6) * 100,
    answered: 2,
    questionCount: 3,
  },
  {
    id: "00000000-0000-4000-8000-0000000250a2",
    title: "Post-operative day 1: sudden dyspnea after hip arthroplasty",
    classId: null,
    className: null,
    closedAt: "2026-10-20T15:45:00Z",
    points: 7.5,
    possible: 9,
    percent: (7.5 / 9) * 100,
    answered: 6,
    questionCount: 6,
  },
  {
    id: "00000000-0000-4000-8000-0000000250a3",
    title: "Respiratory review",
    classId: LIVE_FIXTURE_CLASS_ID,
    className: "NUR 310",
    closedAt: "2026-10-13T15:40:00Z",
    points: 0,
    possible: 4,
    percent: 0,
    answered: 0,
    questionCount: 4,
  },
];

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;

function answered(item: Item, response: AnyResponse, position: number): LiveResultEntry {
  return {
    rowId: String(position),
    position,
    item,
    record: null,
    outcome: { kind: "answered", response, score: scoreSubmission(item, response).score },
  };
}

function mcRight(item: Item): AnyResponse {
  if (item.type !== "multiple_choice") throw new Error("not multiple choice");
  return { type: "multiple_choice", optionId: item.answerKey.correctOptionId };
}

/** Every correct option but one. */
function mrMissingOne(item: Item): AnyResponse {
  if (item.type !== "multiple_response") throw new Error("not multiple response");
  return { type: "multiple_response", optionIds: item.answerKey.correctOptionIds.slice(1) };
}

export function liveResultEntriesFixture(): LiveResultEntry[] {
  return [
    answered(MC, mcRight(MC), 1),
    answered(MR, mrMissingOne(MR), 2),
    { rowId: "4", position: 4, item: MC, record: null, outcome: { kind: "not_answered" } },
  ];
}
