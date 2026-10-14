import { describe, expect, it } from "vitest";
import { offersInQuizFolders, UNFILED } from "./folders";
import {
  childFolders,
  destinationName,
  isMissingSchemaError,
  LIBRARY_FOLDER_MAX_DEPTH,
  libraryFolderContentsMessage,
  libraryFolderWriteError,
  parseLibraryView,
  parseQuizMoveForm,
  QUIZ_MOVE_LIMIT,
  quizMoveSummary,
  type LibraryFolderRow,
} from "./libraryFolders";

const MED_SURG = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e01";
const WEEK_1 = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e02";
const PEDS = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e03";
const QUIZ_1 = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f01";
const QUIZ_2 = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f02";

const rows: LibraryFolderRow[] = [
  { id: MED_SURG, parentId: null, name: "Med-Surg", quizCount: 2 },
  { id: WEEK_1, parentId: MED_SURG, name: "Week 1", quizCount: 0 },
  { id: PEDS, parentId: null, name: "Pediatrics", quizCount: 1 },
];

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("new quizzes offer no folders inside them (#411)", () => {
  it("offers in-quiz folders only to a quiz that already has one", () => {
    expect(offersInQuizFolders([])).toBe(false);
    expect(offersInQuizFolders([{ id: MED_SURG, parentId: null, name: "Cardiac" }])).toBe(true);
  });
});

describe("parseLibraryView", () => {
  it("opens a folder by id, and the top level for anything else", () => {
    expect(parseLibraryView(MED_SURG)).toEqual({ kind: "folder", id: MED_SURG });
    expect(parseLibraryView(undefined)).toEqual({ kind: "top" });
    expect(parseLibraryView("unfiled")).toEqual({ kind: "top" });
    expect(parseLibraryView([MED_SURG])).toEqual({ kind: "top" });
    expect(parseLibraryView("not-an-id")).toEqual({ kind: "top" });
  });
});

describe("childFolders", () => {
  it("lists the folders directly inside a folder, or at the top", () => {
    expect(childFolders(rows, null).map((row) => row.name)).toEqual(["Med-Surg", "Pediatrics"]);
    expect(childFolders(rows, MED_SURG).map((row) => row.name)).toEqual(["Week 1"]);
    expect(childFolders(rows, PEDS)).toEqual([]);
  });
});

describe("parseQuizMoveForm", () => {
  it("reads a folder and the selected quizzes, once each", () => {
    expect(
      parseQuizMoveForm(
        form([
          ["folder", MED_SURG],
          ["quiz", QUIZ_1],
          ["quiz", QUIZ_2],
          ["quiz", QUIZ_1],
        ]),
      ),
    ).toEqual({ ok: true, folderId: MED_SURG, quizIds: [QUIZ_1, QUIZ_2] });
  });

  it("reads Not in a folder as no folder", () => {
    expect(
      parseQuizMoveForm(
        form([
          ["folder", UNFILED],
          ["quiz", QUIZ_1],
        ]),
      ),
    ).toEqual({
      ok: true,
      folderId: null,
      quizIds: [QUIZ_1],
    });
  });

  it("refuses a missing folder, no selection, a bad id and too many quizzes", () => {
    expect(parseQuizMoveForm(form([["quiz", QUIZ_1]]))).toEqual({
      ok: false,
      error: "Choose a folder.",
    });
    expect(parseQuizMoveForm(form([["folder", MED_SURG]]))).toEqual({
      ok: false,
      error: "Select a quiz to move.",
    });
    expect(
      parseQuizMoveForm(
        form([
          ["folder", MED_SURG],
          ["quiz", "x"],
        ]),
      ),
    ).toMatchObject({
      ok: false,
    });
    const many = Array.from(
      { length: QUIZ_MOVE_LIMIT + 1 },
      () => ["quiz", QUIZ_1] as [string, string],
    );
    expect(parseQuizMoveForm(form([["folder", MED_SURG], ...many]))).toEqual({
      ok: false,
      error: `Move at most ${QUIZ_MOVE_LIMIT} quizzes at a time.`,
    });
  });
});

describe("libraryFolderContentsMessage", () => {
  it("is null for an empty folder", () => {
    expect(libraryFolderContentsMessage("Spare", { quizzes: 0, folders: 0 })).toBeNull();
  });

  it("names what is inside and what to do first", () => {
    expect(libraryFolderContentsMessage("Med-Surg", { quizzes: 1, folders: 0 })).toBe(
      '"Med-Surg" holds 1 quiz. Move it out first.',
    );
    expect(libraryFolderContentsMessage("Med-Surg", { quizzes: 3, folders: 0 })).toBe(
      '"Med-Surg" holds 3 quizzes. Move them out first.',
    );
    expect(libraryFolderContentsMessage("Med-Surg", { quizzes: 0, folders: 2 })).toBe(
      '"Med-Surg" holds 2 folders. Delete them first.',
    );
    expect(libraryFolderContentsMessage("Med-Surg", { quizzes: 2, folders: 1 })).toBe(
      '"Med-Surg" holds 2 quizzes and 1 folder. Empty it first.',
    );
  });
});

describe("quizMoveSummary and destinationName", () => {
  it("says what moved where", () => {
    expect(quizMoveSummary(2, destinationName(rows, WEEK_1))).toBe(
      "Moved 2 quizzes to Med-Surg/Week 1.",
    );
    expect(quizMoveSummary(1, destinationName(rows, null))).toBe(
      "Moved 1 quiz to Not in a folder.",
    );
    expect(quizMoveSummary(0, "Med-Surg")).toBe(
      "Nothing was moved. Reload the page and try again.",
    );
  });
});

describe("libraryFolderWriteError", () => {
  it("explains the database's refusals", () => {
    expect(libraryFolderWriteError("23505", "Peds")).toBe(
      'There is already a folder named "Peds" here.',
    );
    expect(libraryFolderWriteError("23514", "Peds")).toBe(
      `Folders go at most ${LIBRARY_FOLDER_MAX_DEPTH} levels deep.`,
    );
    expect(libraryFolderWriteError("23503", "Peds")).toMatch(/Reload the page/);
    expect(libraryFolderWriteError("XX000", "Peds")).toBeNull();
    expect(libraryFolderWriteError(undefined, "Peds")).toBeNull();
  });
});

describe("isMissingSchemaError", () => {
  it("recognises a table or column the database does not have yet", () => {
    for (const code of ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"]) {
      expect(isMissingSchemaError({ code })).toBe(true);
    }
  });

  it("is false for any other failure, and for none", () => {
    expect(isMissingSchemaError({ code: "42501" })).toBe(false);
    expect(isMissingSchemaError({})).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
    expect(isMissingSchemaError(undefined)).toBe(false);
  });
});
