import { describe, expect, it } from "vitest";
import { findRetiredTerms } from "@/lib/copy/retiredTerms";
import {
  isMissingFunctionError,
  newQuizName,
  parseQuizMoveForm,
  QUIZ_MOVE_NOT_READY,
  quizMoveDone,
  quizMoveError,
  selectionLabel,
  staysBehind,
  TURN_NOT_READY,
  turnFolderError,
} from "./quizMove";

const QUIZ = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f02";
const ITEM = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a01";
const CASE = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a02";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe("parseQuizMoveForm", () => {
  it("reads the quiz and the selection", () => {
    expect(
      parseQuizMoveForm(
        form([
          ["quiz", QUIZ],
          ["item", ITEM],
          ["item", ITEM],
          ["caseStudy", CASE],
        ]),
      ),
    ).toEqual({ ok: true, quizId: QUIZ, itemIds: [ITEM], caseStudyIds: [CASE] });
  });

  it("asks for a quiz first", () => {
    expect(parseQuizMoveForm(form([["item", ITEM]]))).toEqual({
      ok: false,
      error: "Choose a quiz to move to.",
    });
    expect(parseQuizMoveForm(form([["quiz", "not-a-quiz"]])).ok).toBe(false);
  });

  it("asks for a selection, and holds the 200 line", () => {
    expect(parseQuizMoveForm(form([["quiz", QUIZ]]))).toEqual({
      ok: false,
      error: "Select at least one question or case study to move.",
    });
    const many = form([["quiz", QUIZ]]);
    for (let i = 0; i < 201; i += 1) many.append("item", ITEM);
    expect(parseQuizMoveForm(many)).toEqual({ ok: false, error: "Move at most 200 at a time." });
  });
});

describe("staysBehind", () => {
  it("lists, for this quiz, what keeps what it was given", () => {
    expect(
      staysBehind({ assignments: 2, liveSessions: 3, practiceClasses: ["NUR 310", "NUR 420"] }),
    ).toEqual([
      "Its 2 assignments keep the questions they were given.",
      "Its 3 live session reports keep their questions.",
      "Practice with NUR 310 and NUR 420 stays with this quiz.",
    ]);
  });

  it("says one of each in the singular, and only what applies", () => {
    expect(staysBehind({ assignments: 1, liveSessions: 0, practiceClasses: [] })).toEqual([
      "Its assignment keeps the questions it was given.",
    ]);
    expect(staysBehind({ assignments: 0, liveSessions: 1, practiceClasses: ["NUR 310"] })).toEqual([
      "Its live session report keeps its questions.",
      "Practice with NUR 310 stays with this quiz.",
    ]);
  });

  it("says so when nothing uses the quiz", () => {
    expect(staysBehind({ assignments: 0, liveSessions: 0, practiceClasses: [] })).toEqual([
      "No assignment, live session or practice uses this quiz yet.",
    ]);
  });

  it("uses the glossary's words", () => {
    const lines = [
      ...staysBehind({ assignments: 2, liveSessions: 2, practiceClasses: ["A", "B", "C"] }),
      ...staysBehind({ assignments: 1, liveSessions: 1, practiceClasses: [] }),
      ...staysBehind({ assignments: 0, liveSessions: 0, practiceClasses: [] }),
      quizMoveDone({ items: 2, caseStudies: 1 }, "Renal week"),
      quizMoveError({ code: "2BP01", hint: "2", details: "Sepsis" }),
      ...["quiz", "content"].map((hint) => quizMoveError({ code: "P0002", hint })),
      ...["limit", "empty", "same"].map((hint) => quizMoveError({ code: "22023", hint })),
      quizMoveError({}),
      ...["P0002", "22023", "XX000"].map((code) => turnFolderError({ code }, "Cardiac")),
      QUIZ_MOVE_NOT_READY,
      TURN_NOT_READY,
    ];
    expect(findRetiredTerms(...lines)).toEqual([]);
  });
});

describe("newQuizName", () => {
  it("is the folder's name when no quiz has it", () => {
    expect(newQuizName("Cardiac", ["Renal week"])).toBe("Cardiac");
  });

  it("numbers it when a quiz reads the same, whatever its case, as the database does", () => {
    expect(newQuizName("Cardiac", ["cardiac"])).toBe("Cardiac (2)");
    expect(newQuizName("Cardiac", ["Cardiac", "CARDIAC (2)"])).toBe("Cardiac (3)");
  });
});

describe("selectionLabel and quizMoveDone", () => {
  it("names what moved", () => {
    expect(selectionLabel({ items: 1, caseStudies: 0 })).toBe("1 question");
    expect(selectionLabel({ items: 0, caseStudies: 0 })).toBe("nothing");
    expect(quizMoveDone({ items: 2, caseStudies: 1 }, "Renal week")).toBe(
      "Moved 2 questions and 1 case study to Renal week.",
    );
  });
});

describe("refusals", () => {
  it("reads a function the database does not have yet as not ready", () => {
    expect(isMissingFunctionError({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunctionError({ code: "42883" })).toBe(true);
    expect(isMissingFunctionError({ code: "P0002" })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
    expect(quizMoveError({ code: "PGRST202" })).toBe(QUIZ_MOVE_NOT_READY);
    expect(turnFolderError({ code: "PGRST202" }, "Cardiac")).toBe(TURN_NOT_READY);
  });

  it("names the case study when a step is moved alone", () => {
    expect(quizMoveError({ code: "2BP01", hint: "2", details: "Sepsis" })).toBe(
      'That question is step 2 of the case study "Sepsis". Select the case study to move it.',
    );
  });

  it("tells a quiz that is gone from a selection that changed", () => {
    expect(quizMoveError({ code: "P0002", hint: "quiz" })).toMatch(/^That quiz no longer exists/);
    expect(quizMoveError({ code: "P0002", hint: "content" })).toMatch(/^The selection has changed/);
  });

  it("says an empty folder has nothing to make a quiz of", () => {
    expect(turnFolderError({ code: "22023" }, "Cardiac")).toBe(
      '"Cardiac" holds no questions or case studies of its own. Delete it instead.',
    );
    expect(turnFolderError({ code: "P0002" }, "Cardiac")).toMatch(/^That folder no longer exists/);
  });
});
