import { inCaseStudies, type ReportItemInput, type SessionReportInput } from "@/lib/live/report";
import type { CjmmStep } from "@/lib/ngn/types";
import type { AssignmentReportInput, ReportAttemptInput } from "./report";

/**
 * The teacher's reports drawn for `/gallery/reports` (#563): a quiz of eight loose questions and a
 * case study of six played in place, wide enough that the students table scrolls at any width,
 * taken by a class of eight as an assignment and by the same eight in a live session. Every name
 * and every question is fictional, and nothing here is an answer key: only question text, steps and
 * the points each answer earned.
 */

const LOOSE: readonly [string, CjmmStep | null][] = [
  ["Which of the client's vital signs should the nurse report to the provider first?", 1],
  ["Select the findings that need follow-up in a client two days after a hip replacement.", 1],
  ["The nurse reviews the morning labs. Which value is the most concerning?", 2],
  ["Order the steps for giving a subcutaneous injection of enoxaparin.", 5],
  ["Which statement by the client shows the teaching about warfarin was understood?", 6],
  ["Complete the sentence about the client's most likely condition and its cause.", 3],
  ["For each finding, choose whether it is expected or unexpected after a cesarean birth.", 1],
  ["Which client should the charge nurse see first?", null],
];

const CASE_STUDY: readonly string[] = [
  "Highlight the findings in the nurses' notes that need follow-up.",
  "Which two conditions is the client most likely developing?",
  "Complete the diagram: the condition, two actions to take, and two parameters to monitor.",
  "Which orders should the nurse expect from the provider?",
  "For each intervention, choose whether it is indicated or not indicated.",
  "Which findings show the client's condition has improved?",
];

const ITEMS: ReportItemInput[] = [
  ...LOOSE.map(([stem, cjmmStep], index) => ({
    position: index + 1,
    itemId: `item-${index + 1}`,
    ref: `sample-${index + 1}`,
    stem,
    type: "multiple_choice",
    cjmmStep,
  })),
  ...CASE_STUDY.map((stem, index) => ({
    position: LOOSE.length + index + 1,
    itemId: `item-${LOOSE.length + index + 1}`,
    ref: `case-sepsis-${index + 1}`,
    stem,
    type: "matrix_multiple_choice",
    cjmmStep: (index + 1) as CjmmStep,
  })),
];

/** The case study as a whole quiz plays it in place (#470): its six steps after the loose eight. */
export const REPORT_GALLERY_ITEMS = inCaseStudies(ITEMS, [
  {
    caseStudyId: "case-sepsis",
    title: "Community-acquired pneumonia and sepsis",
    firstPosition: LOOSE.length + 1,
    stepCount: CASE_STUDY.length,
  },
]);

/** What each question was worth, by position. */
const WORTH = [1, 3, 1, 4, 1, 2, 4, 1, 3, 2, 5, 3, 4, 2];

const STUDENTS = [
  "Ana Reyes",
  "Ben Okafor",
  "Chloe Martin-Delacroix",
  "Dev Patel",
  "Elena Sokolova",
  "Farah Haddad",
  "Gabe Lindqvist",
  "Hana Kobayashi",
];

/** A student's points on a question: a spread of full, partial and none that is easy to check. */
const pointsOf = (student: number, position: number): number => {
  const worth = WORTH[position - 1] ?? 1;
  const turn = (student * 3 + position) % 5;
  if (turn === 0) return 0;
  if (turn === 1) return Math.max(0, worth - 1);
  return worth;
};

const marksOf = (student: number) =>
  ITEMS.map((item) => ({
    itemId: item.itemId,
    points: pointsOf(student, item.position),
    maxPoints: WORTH[item.position - 1] ?? 1,
  }));

const TOTAL = WORTH.reduce((sum, worth) => sum + worth, 0);

function attemptsOf(student: number): ReportAttemptInput[] {
  const studentId = `student-${student}`;
  // The last student never started; the one before has an attempt still open.
  if (student === STUDENTS.length - 1) return [];
  if (student === STUDENTS.length - 2) {
    return [
      {
        studentId,
        id: `${studentId}-1`,
        number: 1,
        submittedAt: null,
        score: null,
        maxScore: null,
        marks: null,
      },
    ];
  }
  const marks = marksOf(student);
  return [
    {
      studentId,
      id: `${studentId}-1`,
      number: 1,
      submittedAt: "2026-11-12T16:20:00Z",
      score: marks.reduce((sum, mark) => sum + mark.points, 0),
      maxScore: TOTAL,
      marks,
    },
  ];
}

/** The assignment, closed (`released`) or still open. */
export function assignmentReportGalleryInput(released: boolean): AssignmentReportInput {
  return {
    released,
    items: REPORT_GALLERY_ITEMS,
    students: STUDENTS.map((displayName, student) => ({ id: `student-${student}`, displayName })),
    attempts: STUDENTS.flatMap((_, student) => attemptsOf(student)),
  };
}

/** The same quiz run as a live session: everyone joined, and the last two left early. */
export const SESSION_REPORT_GALLERY_INPUT: SessionReportInput = {
  items: REPORT_GALLERY_ITEMS,
  participants: STUDENTS.map((displayName, student) => ({
    id: `p-${student}`,
    displayName,
    joinedAt: `2026-11-10T15:00:0${student}Z`,
  })),
  responses: STUDENTS.flatMap((_, student) =>
    ITEMS.filter((item) => student < STUDENTS.length - 2 || item.position <= 4).map((item) => ({
      participantId: `p-${student}`,
      itemPosition: item.position,
      points: pointsOf(student, item.position),
      maxPoints: WORTH[item.position - 1] ?? 1,
    })),
  ),
};

export const REPORT_GALLERY_TITLE = "Week 9: Infection and sepsis";
/** When the assignment closes, and when the live session ended. */
export const REPORT_GALLERY_CLOSED_AT = "2026-11-12T17:00:00Z";
