import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { resendConfirmation } from "@/app/sign-in/actions";
import { ConfirmEmailBanner } from "@/components/auth/ConfirmEmailBanner";
import { BankList } from "@/components/authoring/BankList";
import { CreateBankForm } from "@/components/authoring/CreateBankForm";
import { Breadcrumbs, libraryCrumbs } from "@/components/authoring/FolderBreadcrumbs";
import { LibraryFolderControls } from "@/components/authoring/LibraryFolderControls";
import { LibraryRail } from "@/components/authoring/LibraryRail";
import { MoveToFolderForm } from "@/components/authoring/MoveToFolderForm";
import { QuizSearch, QuizSearchField } from "@/components/authoring/QuizSearch";
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
import { buttonClasses } from "@/components/ui/Button";
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
const NEW_QUIZ_ANCHOR = "#new-bank-heading";

/**
 * Every quiz, for the Get started checklist: the open view lists only some of them once anything
 * is filed in a folder, and the checklist asks about the workspace as a whole.
 */
async function everyQuiz(client: SupabaseClient<Database>, library: Library, view: LibraryView) {
  const listsEverything =
    view.kind === "all" || (view.kind === "top" && library.folders.length === 0);
  return listsEverything ? library.quizzes : listBanks(client);
}

/** The line under the heading: how many quizzes the open view lists. */
function countLine(view: LibraryView, count: number): string {
  const quizzes = countLabel(count, "quiz", "quizzes") ?? "No quizzes";
  return view.kind === "top" ? `${quizzes} not in a folder` : quizzes;
}

export default async function AuthorHomePage({ searchParams }: PageProps<"/author">) {
  const view = parseLibraryView((await searchParams).folder);
  const { supabase, orgId, userId, email } = await requireAuthor("/author");
  // All in one round trip: the badges are one read of the org's shares, not one per bank.
  const [library, sharedWith, claims] = await Promise.all([
    readLibrary(supabase, view),
    listSharedClassNamesByBank(supabase),
    // Read from the token already verified for this request. A teacher who signed up has an
    // address nobody has confirmed yet; the home asks, as the student home does, and never blocks.
    supabase.auth.getClaims().then(({ data }) => data?.claims),
  ]);
  const trail = view.kind === "folder" ? folderTrail(library.folders, view.id) : [];
  // A folder id that is not one of this workspace's folders reads as not found.
  if (view.kind === "folder" && trail.length === 0) notFound();
  const folder = trail.at(-1) ?? null;
  const atTop = view.kind === "top";

  // Get started and the welcome belong to the top of the library only.
  const hidden = !atTop || hiddenFor((await cookies()).get(GET_STARTED_COOKIE)?.value, userId);
  const [progress, welcome] = await Promise.all([
    hidden
      ? null
      : everyQuiz(supabase, library, view).then((all) => readOrgProgress(supabase, orgId, all)),
    atTop ? readTeacherWelcomeState(supabase, userId, orgId) : null,
  ]);
  const steps = progress ? checklistSteps(progress) : [];

  const { quizzes } = library;
  const rail = library.ready ? libraryRail(library.folders, view) : null;
  // Moving needs somewhere to go: any folder, or out of the open one.
  const canMove = library.ready && quizzes.length > 0 && library.folders.length > 0;
  // All quizzes says where each one is filed; the other views are one place each.
  const folderNames =
    view.kind === "all" && library.ready
      ? new Map(quizzes.map((quiz) => [quiz.id, destinationName(library.folders, quiz.folderId)]))
      : undefined;
  // At the top with every quiz filed, the rail's folders are the whole library.
  const allFiled = atTop && quizzes.length === 0 && library.folders.length > 0;

  return (
    <QuizSearch names={quizzes.map((quiz) => quiz.name)}>
      <div
        className={
          rail
            ? "grid gap-6 pb-(--submitbar-height) sm:pb-0 lg:grid-cols-[18rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10"
            : "flex flex-col gap-6 pb-(--submitbar-height) sm:pb-0"
        }
      >
        <header className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {folder ? <Breadcrumbs crumbs={libraryCrumbs(trail, true)} /> : null}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              {/* Classes, live sessions and the workspace are in the layout's navigation (#412). */}
              <h1 className="font-read text-display break-words text-ink-1">
                {folder ? folder.name : "Library"}
              </h1>
              <p className="mt-1 text-ink-2">{countLine(view, quizzes.length)}</p>
            </div>
            <div className="flex w-full flex-wrap items-start gap-3 sm:w-auto">
              {quizzes.length > 0 ? <QuizSearchField className="w-full sm:w-72" /> : null}
              {/* On a phone, New quiz is the bar along the bottom, in thumb reach (Library mockup).
                  It is the empty list's way on too, so the list adds no second link. */}
              <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface-1 px-4 pt-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:border-0 sm:bg-transparent sm:p-0">
                <a
                  href={NEW_QUIZ_ANCHOR}
                  className={`${buttonClasses({ variant: "primary" })} w-full sm:w-auto`}
                >
                  New quiz
                </a>
              </div>
            </div>
          </div>
        </header>

        {rail ? (
          <aside className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:border-r lg:border-line lg:pr-4">
            {/* With no folders yet there is nothing to choose between: only New folder. */}
            {library.folders.length > 0 ? <LibraryRail entries={rail} /> : null}
            <LibraryFolderControls
              folder={folder}
              createFolder={
                trail.length < LIBRARY_FOLDER_MAX_DEPTH
                  ? createLibraryFolderAction.bind(null, folder?.id ?? null)
                  : undefined
              }
              renameFolder={folder ? renameLibraryFolderAction.bind(null, folder.id) : undefined}
              deleteFolder={folder ? deleteLibraryFolderAction.bind(null, folder.id) : undefined}
            />
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-2">
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

          <div className="flex flex-col gap-4">
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
                moveFormId={canMove ? MOVE_FORM_ID : undefined}
                start={(bankId) => startLiveSession.bind(null, bankId)}
                searchable
              />
            )}
          </div>

          <section aria-labelledby="new-bank-heading" className="border-t border-line pt-6">
            <h2 id="new-bank-heading" className="mb-3 text-lg font-semibold text-ink-1">
              New quiz
            </h2>
            <CreateBankForm
              key={`new-quiz-${folder?.id ?? "top"}`}
              action={folder ? createQuizInFolderAction.bind(null, folder.id) : createBank}
            />
          </section>
        </div>
      </div>
    </QuizSearch>
  );
}
