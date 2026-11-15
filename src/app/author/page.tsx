import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { resendConfirmation } from "@/app/sign-in/actions";
import { ConfirmEmailBanner } from "@/components/auth/ConfirmEmailBanner";
import { BankList } from "@/components/authoring/BankList";
import { libraryCrumbs } from "@/components/authoring/FolderBreadcrumbs";
import { LibraryFolderControls } from "@/components/authoring/LibraryFolderControls";
import { MoveToFolderForm } from "@/components/authoring/MoveToFolderForm";
import { LibraryFrame, NEW_QUIZ_HEADING_ID } from "@/components/authoring/LibraryFrame";
import { GET_STARTED_HEADING_ID, GetStarted } from "@/components/onboarding/GetStarted";
import { TeacherWelcome } from "@/components/onboarding/TeacherWelcome";
import { isEmailUnconfirmed } from "@/lib/auth/emailConfirmation";
import { listBanks } from "@/lib/authoring/banks";
import { countLabel, folderTrail } from "@/lib/authoring/folders";
import { readLibrary, type Library } from "@/lib/authoring/libraryData";
import {
  destinationName,
  LIBRARY_FOLDER_MAX_DEPTH,
  libraryRail,
  libraryViewHref,
  parseLibraryView,
  type LibraryView,
} from "@/lib/authoring/libraryFolders";
import { requireAuthor } from "@/lib/authoring/session";
import {
  checklistSteps,
  GET_STARTED_COOKIE,
  hiddenFor,
  showChecklist,
} from "@/lib/onboarding/checklist";
import { readOrgProgress } from "@/lib/onboarding/progress";
import {
  readTeacherWelcomeState,
  showTeacherWelcome,
  teacherWelcomeSteps,
} from "@/lib/onboarding/teacherWelcome";
import { listSharedClassNamesByBank } from "@/lib/supabase/practiceShares";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { startLiveSession } from "@/app/live/actions";
import { EmptyState } from "@/components/ui/EmptyState";
import { createBank } from "./actions";
import {
  createLibraryFolderAction,
  createQuizInFolderAction,
  deleteLibraryFolderAction,
  moveQuizzesAction,
  renameLibraryFolderAction,
} from "./libraryActions";
import { hideGetStarted, importSample, markOnboarded } from "./onboardingActions";

export const metadata: Metadata = { title: "Library" };

const MOVE_FORM_ID = "move-quizzes";
const NEW_QUIZ_ANCHOR = `#${NEW_QUIZ_HEADING_ID}`;

/**
 * Every quiz, for the Get started checklist: the open view lists only some of them once anything
 * is filed in a folder, and the checklist asks about the workspace as a whole.
 */
async function everyQuiz(client: SupabaseClient<Database>, library: Library, view: LibraryView) {
  const listsEverything =
    view.kind === "all" || (view.kind === "top" && library.folders.length === 0);
  return listsEverything ? library.quizzes : listBanks(client);
}

/**
 * The line under the title: how many quizzes the open view lists. At the top of a library with
 * folders that is the quizzes in none; with no folders yet, simply the count. Never drawn for an
 * empty list, whose own heading says so ("No quizzes yet", "Every quiz is in a folder").
 */
function countLine(view: LibraryView, count: number, hasFolders: boolean): string {
  const quizzes = countLabel(count, "quiz", "quizzes") ?? "No quizzes";
  return view.kind === "top" && hasFolders ? `${quizzes} not in a folder` : quizzes;
}

export default async function AuthorHomePage({ searchParams }: PageProps<"/author">) {
  const view = parseLibraryView((await searchParams).folder);
  const { supabase, orgId, userId, email } = await requireAuthor("/author");
  const atTop = view.kind === "top";
  // Get started and the welcome belong to the top of the library only.
  const hidden = !atTop || hiddenFor((await cookies()).get(GET_STARTED_COOKIE)?.value, userId);
  const libraryRead = readLibrary(supabase, view);
  // perf-audit #14: the checklist's reads and the welcome's need nothing the library says, so
  // they start beside it; only the list of every quiz, where the open view does not hold it,
  // waits for the library.
  const progressRead = hidden
    ? null
    : readOrgProgress(
        supabase,
        orgId,
        libraryRead.then((library) => everyQuiz(supabase, library, view)),
      );
  const welcomeRead = atTop ? readTeacherWelcomeState(supabase, userId, orgId) : null;
  // Awaited below; this only keeps a failure from going unobserved if the page stops first.
  progressRead?.catch(() => undefined);
  welcomeRead?.catch(() => undefined);
  // All in one round trip: the badges are one read of the org's shares, not one per bank.
  const [library, sharedWith, claims] = await Promise.all([
    libraryRead,
    listSharedClassNamesByBank(supabase),
    // Read from the token already verified for this request. A teacher who signed up has an
    // address nobody has confirmed yet; the home asks, as the student home does, and never blocks.
    supabase.auth.getClaims().then(({ data }) => data?.claims),
  ]);
  const trail = view.kind === "folder" ? folderTrail(library.folders, view.id) : [];
  // A folder id that is not one of this workspace's folders reads as not found.
  if (view.kind === "folder" && trail.length === 0) notFound();
  const folder = trail.at(-1) ?? null;

  const [progress, welcome] = await Promise.all([progressRead, welcomeRead]);
  const steps = progress ? checklistSteps(progress) : [];

  const { quizzes } = library;
  // A rail only once there is a folder to choose: with none it would hold nothing but New folder.
  const rail =
    library.ready && library.folders.length > 0 ? libraryRail(library.folders, view) : null;
  // Moving needs somewhere to go: any folder, or out of the open one.
  const canMove = library.ready && quizzes.length > 0 && library.folders.length > 0;
  // All quizzes says where each one is filed; the other views are one place each.
  const folderNames =
    view.kind === "all" && library.ready
      ? new Map(quizzes.map((quiz) => [quiz.id, destinationName(library.folders, quiz.folderId)]))
      : undefined;
  // At the top with every quiz filed, the rail's folders are the whole library.
  const allFiled = atTop && quizzes.length === 0 && library.folders.length > 0;

  const intro = (
    <>
      {atTop && isEmailUnconfirmed(claims) ? (
        <ConfirmEmailBanner action={resendConfirmation} email={email} />
      ) : null}
      {/* After the h1, so the heading outline reads Library, then Get started. */}
      {showChecklist(steps, hidden) ? (
        <GetStarted steps={steps} importSample={importSample} hide={hideGetStarted} />
      ) : null}
      {welcome && showTeacherWelcome(welcome) ? (
        <TeacherWelcome
          // A colleague who was invited in gets the short one: it is not a workspace of their own.
          steps={teacherWelcomeSteps(welcome.displayName, { invited: welcome.invited })}
          onDone={markOnboarded}
          focusAfter={GET_STARTED_HEADING_ID}
        />
      ) : null}
    </>
  );
  // Folders are made once they can be (`ready`), and only so deep.
  const folderControls = library.ready ? (
    <LibraryFolderControls
      folder={folder}
      placement={rail ? "rail" : "toolbar"}
      createFolder={
        trail.length < LIBRARY_FOLDER_MAX_DEPTH
          ? createLibraryFolderAction.bind(null, folder?.id ?? null)
          : undefined
      }
      renameFolder={folder ? renameLibraryFolderAction.bind(null, folder.id) : undefined}
      deleteFolder={folder ? deleteLibraryFolderAction.bind(null, folder.id) : undefined}
    />
  ) : null;

  return (
    <LibraryFrame
      title={folder ? folder.name : "Library"}
      // An empty list says what is missing itself, in its heading.
      lead={quizzes.length > 0 ? countLine(view, quizzes.length, library.folders.length > 0) : null}
      crumbs={folder ? libraryCrumbs(trail, true) : null}
      createQuiz={folder ? createQuizInFolderAction.bind(null, folder.id) : createBank}
      createKey={folder?.id ?? "top"}
      names={quizzes.map((quiz) => quiz.name)}
      rail={rail}
      folderControls={folderControls}
      intro={intro}
    >
      {canMove ? (
        <MoveToFolderForm
          key={`move-${folder?.id ?? view.kind}`}
          id={MOVE_FORM_ID}
          folders={library.folders}
          action={moveQuizzesAction}
        />
      ) : null}
      {allFiled ? (
        <EmptyState
          level={2}
          heading="Every quiz is in a folder"
          action={{ href: libraryViewHref({ kind: "all" }), label: "All quizzes" }}
        />
      ) : (
        <BankList
          banks={quizzes}
          sharedWith={sharedWith}
          folderNames={folderNames}
          emptyHeading={folder ? "No quizzes in this folder" : undefined}
          // The next step is the header's New quiz form, which makes it here (#563).
          emptyAction={{ href: NEW_QUIZ_ANCHOR, label: "New quiz" }}
          moveFormId={canMove ? MOVE_FORM_ID : undefined}
          start={(bankId) => startLiveSession.bind(null, bankId)}
          searchable
        />
      )}
    </LibraryFrame>
  );
}
