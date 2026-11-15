import type { LibraryQuiz } from "./libraryData";
import type { LibraryFolderRow } from "./libraryFolders";

/**
 * The teacher's library for `/gallery/library` (#563): quizzes and folders with fictional names
 * and no questions behind them, so the screenshot suite can draw the library with no database.
 * Nothing here is or holds an answer key.
 */

export const LIBRARY_FIXTURE_MED_SURG = "00000000-0000-4000-8000-0000000001f1";
export const LIBRARY_FIXTURE_PEDIATRICS = "00000000-0000-4000-8000-0000000001f2";

export const LIBRARY_FIXTURE_FOLDERS: readonly LibraryFolderRow[] = [
  { id: LIBRARY_FIXTURE_MED_SURG, parentId: null, name: "Med-Surg", quizCount: 2 },
  { id: LIBRARY_FIXTURE_PEDIATRICS, parentId: null, name: "Pediatrics", quizCount: 1 },
];

/** Every quiz, with the folder each is filed in; the views below pick from it. */
export const LIBRARY_FIXTURE_QUIZZES: readonly LibraryQuiz[] = [
  {
    id: "00000000-0000-4000-8000-0000000001b1",
    name: "Cardiac week: heart failure and dysrhythmias",
    itemCount: 12,
    updatedAt: "2026-11-12T15:00:00Z",
    folderId: LIBRARY_FIXTURE_MED_SURG,
  },
  {
    id: "00000000-0000-4000-8000-0000000001b2",
    name: "Renal week",
    itemCount: 8,
    updatedAt: "2026-11-10T09:30:00Z",
    folderId: LIBRARY_FIXTURE_MED_SURG,
  },
  {
    id: "00000000-0000-4000-8000-0000000001b3",
    name: "Pediatric respiratory",
    itemCount: 6,
    updatedAt: "2026-11-08T12:00:00Z",
    folderId: LIBRARY_FIXTURE_PEDIATRICS,
  },
  {
    id: "00000000-0000-4000-8000-0000000001b4",
    name: "Sample bank",
    itemCount: 21,
    updatedAt: "2026-11-01T08:00:00Z",
    folderId: null,
  },
  {
    id: "00000000-0000-4000-8000-0000000001b5",
    name: "Pharmacology review",
    itemCount: 1,
    updatedAt: "2026-10-28T17:45:00Z",
    folderId: null,
  },
];

/** The quizzes the top of the library lists: those in no folder. */
export function libraryFixtureTop(): LibraryQuiz[] {
  return LIBRARY_FIXTURE_QUIZZES.filter((quiz) => quiz.folderId === null);
}

/** The quizzes filed in one folder. */
export function libraryFixtureIn(folderId: string): LibraryQuiz[] {
  return LIBRARY_FIXTURE_QUIZZES.filter((quiz) => quiz.folderId === folderId);
}
