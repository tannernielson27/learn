"use client";

import { BankList } from "@/components/authoring/BankList";
import { libraryCrumbs } from "@/components/authoring/FolderBreadcrumbs";
import type { FolderFormState } from "@/components/authoring/FolderNameForm";
import { LibraryFolderControls } from "@/components/authoring/LibraryFolderControls";
import { LibraryFrame, NEW_QUIZ_HEADING_ID } from "@/components/authoring/LibraryFrame";
import { MoveToFolderForm } from "@/components/authoring/MoveToFolderForm";
import { GetStarted } from "@/components/onboarding/GetStarted";
import { EmptyState } from "@/components/ui/EmptyState";
import { countLabel } from "@/lib/authoring/folders";
import {
  LIBRARY_FIXTURE_FOLDERS,
  LIBRARY_FIXTURE_MED_SURG,
  LIBRARY_FIXTURE_QUIZZES,
  libraryFixtureIn,
  libraryFixtureTop,
} from "@/lib/authoring/libraryFixture";
import { libraryRail, libraryViewHref } from "@/lib/authoring/libraryFolders";
import { checklistSteps } from "@/lib/onboarding/checklist";

/** What the gallery draws: a library before its first folder, an empty one, and with folders. */
export type LibraryDemoState = "start" | "empty" | "folders" | "folder" | "all-filed";

const NOT_HERE = "Not in the gallery.";
const notHere = async (): Promise<FolderFormState> => ({ status: "error", error: NOT_HERE });
const createQuiz = async () => ({ status: "error" as const, error: NOT_HERE });
const importSample = async () => ({ status: "error" as const, error: NOT_HERE });
const nothing = async () => {};

const SHARED = new Map([[LIBRARY_FIXTURE_QUIZZES[3]!.id, ["NUR 310"]]]);

/**
 * The library as `src/app/author/page.tsx` draws it, from `libraryFixture.ts` with every action
 * answering that it is not available here. The page's own reads and server actions stay on the
 * page; this composes the same components.
 */
export function LibraryDemo({ state }: { state: LibraryDemoState }) {
  const hasFolders = state === "folders" || state === "folder" || state === "all-filed";
  const folders = hasFolders ? LIBRARY_FIXTURE_FOLDERS : [];
  const folder =
    state === "folder"
      ? LIBRARY_FIXTURE_FOLDERS.find((row) => row.id === LIBRARY_FIXTURE_MED_SURG)!
      : null;
  const quizzes =
    state === "empty" || state === "all-filed"
      ? []
      : state === "start"
        ? [...LIBRARY_FIXTURE_QUIZZES]
        : folder
          ? libraryFixtureIn(folder.id)
          : libraryFixtureTop();
  const view = folder ? { kind: "folder" as const, id: folder.id } : { kind: "top" as const };
  const rail = hasFolders ? libraryRail(folders, view) : null;
  const canMove = hasFolders && quizzes.length > 0;
  const atTop = !folder;
  // Get started at the top before the first folder: none done when empty, the sample in after.
  const steps =
    state === "empty"
      ? checklistSteps({ banks: [], hasClass: false, hasAssignmentOrSession: false })
      : state === "start"
        ? checklistSteps({
            banks: quizzes.map(({ id, name }) => ({ id, name })),
            hasClass: false,
            hasAssignmentOrSession: false,
          })
        : [];
  const count = countLabel(quizzes.length, "quiz", "quizzes");

  return (
    <LibraryFrame
      title={folder ? folder.name : "Library"}
      lead={count ? (atTop && hasFolders ? `${count} not in a folder` : count) : null}
      crumbs={folder ? libraryCrumbs([folder], true) : null}
      createQuiz={createQuiz}
      createKey={folder?.id ?? "top"}
      names={quizzes.map((quiz) => quiz.name)}
      rail={rail}
      folderControls={
        <LibraryFolderControls
          folder={folder}
          placement={rail ? "rail" : "toolbar"}
          createFolder={notHere}
          renameFolder={folder ? notHere : undefined}
          deleteFolder={folder ? notHere : undefined}
        />
      }
      intro={
        steps.length > 0 ? (
          <GetStarted steps={steps} importSample={importSample} hide={nothing} />
        ) : null
      }
    >
      {canMove ? <MoveToFolderForm id="move-quizzes" folders={folders} action={notHere} /> : null}
      {state === "all-filed" ? (
        <EmptyState
          level={2}
          heading="Every quiz is in a folder"
          action={{ href: libraryViewHref({ kind: "all" }), label: "All quizzes" }}
        />
      ) : (
        <BankList
          banks={quizzes}
          sharedWith={SHARED}
          emptyHeading={folder ? "No quizzes in this folder" : undefined}
          emptyAction={{ href: `#${NEW_QUIZ_HEADING_ID}`, label: "New quiz" }}
          moveFormId={canMove ? "move-quizzes" : undefined}
          start={() => nothing}
          searchable
        />
      )}
    </LibraryFrame>
  );
}
