import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { resendConfirmation } from "@/app/sign-in/actions";
import { ConfirmEmailBanner } from "@/components/auth/ConfirmEmailBanner";
import { BankList } from "@/components/authoring/BankList";
import { CreateBankForm } from "@/components/authoring/CreateBankForm";
import { DeleteFolderForm } from "@/components/authoring/DeleteFolderForm";
import { Breadcrumbs, libraryCrumbs } from "@/components/authoring/FolderBreadcrumbs";
import { FolderNameForm } from "@/components/authoring/FolderNameForm";
import { LibraryFolderList } from "@/components/authoring/LibraryFolderList";
import { MoveToFolderForm } from "@/components/authoring/MoveToFolderForm";
import { GET_STARTED_HEADING_ID, GetStarted } from "@/components/onboarding/GetStarted";
import { TeacherWelcome } from "@/components/onboarding/TeacherWelcome";
import { isEmailUnconfirmed } from "@/lib/auth/emailConfirmation";
import { listBanks } from "@/lib/authoring/banks";
import { folderTrail } from "@/lib/authoring/folders";
import { readLibrary, type Library } from "@/lib/authoring/libraryData";
import {
  childFolders,
  LIBRARY_FOLDER_MAX_DEPTH,
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
const SUMMARY_CLASS =
  "tap-target flex cursor-pointer items-center text-sm font-medium text-accent-ink";

/**
 * Every quiz, for the Get started checklist: the open view lists only some of them once anything
 * is filed in a folder, and the checklist asks about the workspace as a whole.
 */
async function everyQuiz(client: SupabaseClient<Database>, library: Library, view: LibraryView) {
  const listsEverything = view.kind === "top" && library.folders.length === 0;
  return listsEverything ? library.quizzes : listBanks(client);
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
  const atTop = folder === null;

  // Get started and the welcome belong to the top of the library only.
  const hidden = !atTop || hiddenFor((await cookies()).get(GET_STARTED_COOKIE)?.value, userId);
  const [progress, welcome] = await Promise.all([
    hidden
      ? null
      : everyQuiz(supabase, library, view).then((all) => readOrgProgress(supabase, orgId, all)),
    atTop ? readTeacherWelcomeState(supabase, userId, orgId) : null,
  ]);
  const steps = progress ? checklistSteps(progress) : [];

  const folders = childFolders(library.folders, folder?.id ?? null);
  const { quizzes } = library;
  // Moving needs somewhere to go: any folder, or out of the open one.
  const canMove = library.ready && quizzes.length > 0 && library.folders.length > 0;
  // At the top with folders and every quiz filed, the folders are the whole list.
  const showQuizList = quizzes.length > 0 || !atTop || folders.length === 0;

  return (
    <>
      {folder ? <Breadcrumbs crumbs={libraryCrumbs(trail, true)} /> : null}
      {/* Classes, live sessions and the workspace are in the layout's navigation (#412). */}
      <h1 className="mb-6 font-read text-3xl break-words text-ink-1">
        {folder ? folder.name : "Library"}
      </h1>
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
        <LibraryFolderList folders={folders} />
        {canMove ? (
          <MoveToFolderForm
            key={`move-${folder?.id ?? "top"}`}
            id={MOVE_FORM_ID}
            folders={library.folders}
            action={moveQuizzesAction}
          />
        ) : null}
        {showQuizList ? (
          <BankList
            banks={quizzes}
            sharedWith={sharedWith}
            emptyHeading={folder ? "No quizzes in this folder" : undefined}
            emptyAction={{ href: "#new-bank-heading", label: "New quiz" }}
            moveFormId={canMove ? MOVE_FORM_ID : undefined}
          />
        ) : null}
      </div>

      <section aria-labelledby="new-bank-heading" className="mt-10 border-t border-line pt-6">
        <h2 id="new-bank-heading" className="mb-3 text-lg font-medium text-ink-1">
          New quiz
        </h2>
        <CreateBankForm
          key={`new-quiz-${folder?.id ?? "top"}`}
          action={folder ? createQuizInFolderAction.bind(null, folder.id) : createBank}
        />
      </section>

      {library.ready ? (
        <div className="mt-6 flex flex-col gap-4 border-t border-line pt-6">
          {trail.length < LIBRARY_FOLDER_MAX_DEPTH ? (
            <details>
              <summary className={SUMMARY_CLASS}>New folder</summary>
              <div className="mt-3 sm:max-w-md">
                <FolderNameForm
                  // Keyed by the open folder, so a half-typed name never carries into another one.
                  key={`new-folder-${folder?.id ?? "top"}`}
                  action={createLibraryFolderAction.bind(null, folder?.id ?? null)}
                  label="Folder name"
                  submitLabel="Create folder"
                />
              </div>
            </details>
          ) : null}
          {folder ? (
            <>
              <details>
                <summary className={SUMMARY_CLASS}>Rename folder</summary>
                <div className="mt-3 sm:max-w-md">
                  <FolderNameForm
                    key={`rename-${folder.id}`}
                    action={renameLibraryFolderAction.bind(null, folder.id)}
                    label="New name"
                    submitLabel="Rename folder"
                    initialName={folder.name}
                  />
                </div>
              </details>
              <DeleteFolderForm
                key={`delete-${folder.id}`}
                action={deleteLibraryFolderAction.bind(null, folder.id)}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
