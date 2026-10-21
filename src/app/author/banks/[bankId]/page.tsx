import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archiveSelectedAction,
  restoreCaseStudyAction,
  restoreItemAction,
} from "@/app/author/archiveActions";
import { ArchiveViewSwitch } from "@/components/authoring/ArchiveViewSwitch";
import { BankSearchForm } from "@/components/authoring/BankSearchForm";
import { CaseStudyList } from "@/components/authoring/CaseStudyList";
import { CreateBankForm } from "@/components/authoring/CreateBankForm";
import { CreateCaseStudyForm } from "@/components/authoring/CreateCaseStudyForm";
import { DeleteFolderForm } from "@/components/authoring/DeleteFolderForm";
import { FolderBreadcrumbs } from "@/components/authoring/FolderBreadcrumbs";
import { FolderNameForm } from "@/components/authoring/FolderNameForm";
import { FolderTree } from "@/components/authoring/FolderTree";
import { ImportJsonForm } from "@/components/authoring/ImportJsonForm";
import { ItemList } from "@/components/authoring/ItemList";
import { PracticeBadge } from "@/components/practice/PracticeBadge";
import { PracticeSection } from "@/components/practice/PracticeSection";
import { QuizMoveForm } from "@/components/authoring/QuizMoveForm";
import { TurnFolderIntoQuizButton } from "@/components/authoring/TurnFolderIntoQuizButton";
import { Pager } from "@/components/authoring/Pager";
import { TagFilterBar } from "@/components/authoring/TagFilterBar";
import { Button, buttonClasses } from "@/components/ui/Button";
import { startLiveSession } from "@/app/live/actions";
import { shareBankWithClass, stopSharing } from "@/app/author/practice/actions";
import { aiImportEnabled } from "@/lib/aiImport/config";
import { workspaceEnabled } from "@/lib/aiImport/upload/access";
import { assignmentPath } from "@/lib/assignments/assignments";
import { bankCaseStudiesEmpty, bankItemsEmpty } from "@/lib/authoring/bankEmpty";
import {
  isSearching,
  parseItemSearch,
  parsePage,
  searchSummary,
  type BankFilter,
} from "@/lib/authoring/bankSearch";
import { listCaseStudies, listItems, listTaggedRows } from "@/lib/authoring/banks";
import { listFolders } from "@/lib/authoring/folderData";
import {
  folderTrail,
  MAX_FOLDER_DEPTH,
  NOT_IN_A_FOLDER,
  offersInQuizFolders,
  parseFolderView,
  type FolderView,
} from "@/lib/authoring/folders";
import { quizLibraryTrail } from "@/lib/authoring/libraryData";
import { newQuizName, staysBehind } from "@/lib/authoring/quizMove";
import { readMoveContext } from "@/lib/authoring/quizMoveData";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { bankViewHref, isFiltering, parseTagFilter, tagFacets } from "@/lib/authoring/tagFilter";
import { stopSharingWarning } from "@/lib/practice/shares";
import { listClasses } from "@/lib/supabase/classes";
import { listBankShares } from "@/lib/supabase/practiceShares";
import {
  createCaseStudyInBank,
  createFolderInBank,
  deleteFolderInBank,
  importIntoBank,
  moveToFolderInBank,
  renameBank,
  renameFolderInBank,
} from "../../actions";
import { moveToQuizAction, turnFolderIntoQuizAction } from "../../quizMoveActions";

export const metadata: Metadata = { title: "Quiz" };

const MOVE_FORM_ID = "move-to-folder";

/** Why a live session could not start, carried back on the query string by startLiveSession. */
function liveStartMessage(value: string | string[] | undefined): string | undefined {
  const reason = Array.isArray(value) ? value[0] : value;
  if (reason === undefined) return undefined;
  if (reason === "empty") return "Publish a question in this quiz before starting a live session.";
  if (reason === "gone") return "That quiz no longer exists.";
  return "The live session could not be started. Try again.";
}

export default async function BankPage({
  params,
  searchParams,
}: PageProps<"/author/banks/[bankId]">) {
  const { bankId } = await params;
  if (!isUuid(bankId)) notFound();
  const query = await searchParams;
  const askedView = parseFolderView(query.folder);
  const search = parseItemSearch(query);
  const filter: BankFilter = {
    ...parseTagFilter(query.tag, query.step, query.warnings),
    ...search,
  };
  const page = parsePage(query.page);
  const tagFiltered = isFiltering(filter);
  const searching = isSearching(search);
  // The Archived view is the status filter set to archived; every other list leaves archived out.
  const archived = search.status === "archived";

  const author = await requireAuthor(`/author/banks/${bankId}`);
  const { supabase } = author;
  // #345: the Import with AI link, where AI import is on for the deployment and the workspace.
  const aiImportOn = aiImportEnabled()
    ? workspaceEnabled(author).then((on) => on === true)
    : Promise.resolve(false);
  aiImportOn.catch(() => undefined);
  const { data: bank } = await supabase
    .from("item_banks")
    .select("id, name")
    .eq("id", bankId)
    .maybeSingle();
  if (!bank) notFound();

  // #411: a quiz offers folders inside it only if it already has one. Without any, every view is
  // the whole quiz, so a stale "Not in a folder" link still lists everything.
  // The reads that do not depend on the view start now, beside the folders.
  const besideFolders = Promise.all([
    quizLibraryTrail(supabase, bank.id),
    listBankShares(supabase, bank.id),
    listClasses(supabase),
    readMoveContext(supabase, bank.id),
  ]);
  // Awaited below; this only keeps a failure from going unobserved if the page stops first.
  besideFolders.catch(() => undefined);
  const folders = await listFolders(supabase, bank.id);
  const inQuizFolders = offersInQuizFolders(folders);
  const view: FolderView = inQuizFolders ? askedView : { kind: "all" };
  if (!inQuizFolders && askedView.kind === "folder") notFound();

  // The filter and search run in the database, under RLS; the tag counts come from the view's
  // items within the search.
  const [[libraryTrail, shares, classes, moveContext], itemPage, caseStudies, taggedRows] =
    await Promise.all([
      besideFolders,
      listItems(supabase, bank.id, view, filter, page),
      // Case studies carry no item tags or type, so a tag or type filter lists none of them.
      tagFiltered || search.type
        ? Promise.resolve([])
        : listCaseStudies(supabase, bank.id, view, search),
      listTaggedRows(supabase, bank.id, view, search),
    ]);
  const { items } = itemPage;
  const aiImport = await aiImportOn.catch(() => false);
  const facets = tagFacets(taggedRows, filter);
  const trail = view.kind === "folder" ? folderTrail(folders, view.id) : [];
  // A folder id that is not one of this bank's folders reads as not found.
  if (view.kind === "folder" && trail.length === 0) notFound();
  const folder = trail.at(-1);
  const heading = folder?.name ?? (view.kind === "unfiled" ? NOT_IN_A_FOLDER : bank.name);
  // #417: moving to another quiz, and turning a folder into one, are offered only when the confirm
  // step can say everything that stays with this quiz: its assignments, live sessions and shares.
  const knowsUses = moveContext !== null && shares !== null;
  const otherQuizzes = moveContext?.quizzes ?? [];
  const keptLines = staysBehind({
    assignments: moveContext?.uses.assignments ?? 0,
    liveSessions: moveContext?.uses.liveSessions ?? 0,
    practiceClasses: (shares ?? []).map((entry) => entry.name),
  });
  const hasContent = items.length > 0 || caseStudies.length > 0;
  // Moving between in-quiz folders, only where there are some; to another quiz, where there is one.
  const canMoveToQuiz = knowsUses && otherQuizzes.length > 0 && hasContent;
  const canMove = (inQuizFolders && hasContent) || canMoveToQuiz;
  // #471: current rows archive from the list, one by one or selected; the Archived view restores.
  const canArchive = !archived && hasContent;
  const selectionFormId = canMove || canArchive ? MOVE_FORM_ID : undefined;
  const archiveFormId = canArchive ? MOVE_FORM_ID : undefined;
  // #266: what each list says when it is empty, most specific reason first.
  const emptyView = { bankId: bank.id, view, filter, page };
  const liveRefusal = liveStartMessage(query.live);

  return (
    <>
      <FolderBreadcrumbs
        bankId={bank.id}
        bankName={bank.name}
        trail={trail}
        view={view}
        libraryTrail={libraryTrail}
      />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h1 className="min-w-0 font-read text-3xl break-words text-ink-1">{heading}</h1>
          <PracticeBadge classNames={(shares ?? []).map((entry) => entry.name)} />
        </div>
        <ArchiveViewSwitch bankId={bank.id} view={view} filter={filter} />
        <form
          action={startLiveSession.bind(null, bank.id)}
          className="flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          {/* #185: how the live session is paced. Teacher-paced is the default and comes first. */}
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <legend className="sr-only">Pacing</legend>
            <label className="tap-target inline-flex items-center gap-2 text-sm text-ink-1">
              <input type="radio" name="pacing" value="instructor_paced" defaultChecked />
              Teacher-paced
            </label>
            <label className="tap-target inline-flex items-center gap-2 text-sm text-ink-1">
              <input type="radio" name="pacing" value="student_paced" />
              Student-paced
            </label>
          </fieldset>
          <Button type="submit" variant="secondary">
            Start a live session
          </Button>
          {/* #207: the same bank, given to a class to take at home. */}
          <Link href={assignmentPath({ kind: "bank", id: bank.id })} className={buttonClasses()}>
            Assign
          </Link>
        </form>
        <Link
          href={`/author/banks/${bank.id}/new`}
          className={buttonClasses({ variant: "primary" })}
        >
          New question
        </Link>
      </div>
      {liveRefusal ? (
        <p role="alert" className="mb-6 text-sm text-incorrect">
          {liveRefusal}
        </p>
      ) : null}

      <div className={inQuizFolders ? "grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]" : undefined}>
        {inQuizFolders ? (
          <aside className="flex min-w-0 flex-col gap-6">
            <FolderTree bankId={bank.id} folders={folders} view={view} filter={filter} />
            {trail.length < MAX_FOLDER_DEPTH ? (
              <FolderNameForm
                // Keyed by the open folder, so a half-typed name never carries into another folder.
                key={`new-${folder?.id ?? "top"}`}
                action={createFolderInBank.bind(null, bank.id, folder?.id ?? null)}
                label="Folder name"
                hint={folder ? `Inside ${folder.name}.` : undefined}
                submitLabel="Create folder"
              />
            ) : (
              <p className="text-sm text-ink-2">
                Folders go at most {MAX_FOLDER_DEPTH} levels deep.
              </p>
            )}
            {folder ? (
              <section
                aria-labelledby="folder-heading"
                className="flex flex-col gap-4 border-t border-line pt-4"
              >
                <h2 id="folder-heading" className="text-sm font-medium text-ink-2">
                  This folder
                </h2>
                <FolderNameForm
                  key={`rename-${folder.id}`}
                  action={renameFolderInBank.bind(null, bank.id, folder.id)}
                  label="New name"
                  submitLabel="Rename folder"
                  initialName={folder.name}
                />
                <DeleteFolderForm
                  key={`delete-${folder.id}`}
                  action={deleteFolderInBank.bind(null, bank.id, folder.id)}
                />
                {knowsUses ? (
                  <TurnFolderIntoQuizButton
                    key={`turn-${folder.id}`}
                    action={turnFolderIntoQuizAction.bind(null, bank.id, folder.id)}
                    folderName={folder.name}
                    quizName={newQuizName(folder.name, [
                      bank.name,
                      ...otherQuizzes.map((quiz) => quiz.name),
                    ])}
                    hasSubfolders={folders.some((row) => row.parentId === folder.id)}
                    staysBehind={keptLines}
                  />
                ) : null}
              </section>
            ) : null}
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="items-heading" className="flex flex-col gap-4">
            <h2 id="items-heading" className="font-read text-2xl text-ink-1">
              {archived ? "Archived questions" : "Questions"}
            </h2>
            <BankSearchForm bankId={bank.id} view={view} filter={filter} />
            <TagFilterBar bankId={bank.id} view={view} filter={filter} facets={facets} />
            {searching ? (
              <p role="status" className="text-ink-1">
                {searchSummary(itemPage.total, search)}
              </p>
            ) : null}
            {selectionFormId ? (
              <QuizMoveForm
                key={`move-${folder?.id ?? view.kind}`}
                id={MOVE_FORM_ID}
                folders={inQuizFolders ? folders : []}
                moveToFolder={moveToFolderInBank.bind(null, bank.id)}
                quizzes={canMoveToQuiz ? otherQuizzes : []}
                moveToQuiz={moveToQuizAction.bind(null, bank.id)}
                staysBehind={keptLines}
                archive={canArchive ? archiveSelectedAction.bind(null, bank.id) : undefined}
                archivedHref={bankViewHref(bank.id, view, { ...filter, status: "archived" })}
              />
            ) : null}
            <ItemList
              items={items}
              moveFormId={selectionFormId}
              archiveFormId={archiveFormId}
              restoreAction={archived ? (id) => restoreItemAction.bind(null, id) : undefined}
              empty={bankItemsEmpty(emptyView)}
            />
            <Pager
              page={page}
              pageCount={itemPage.pageCount}
              hrefFor={(target) => bankViewHref(bank.id, view, filter, target)}
            />
          </section>
          <section aria-labelledby="case-studies-heading" className="flex flex-col gap-4">
            <h2 id="case-studies-heading" className="font-read text-2xl text-ink-1">
              {archived ? "Archived case studies" : "Case studies"}
            </h2>
            {tagFiltered || search.type ? (
              <p className="text-ink-2">
                {tagFiltered
                  ? "Tag filters list questions only. Clear them to see case studies."
                  : "A type filter lists questions only. Choose Any type to see case studies."}
              </p>
            ) : (
              <CaseStudyList
                caseStudies={caseStudies}
                moveFormId={selectionFormId}
                archiveFormId={archiveFormId}
                restoreAction={archived ? (id) => restoreCaseStudyAction.bind(null, id) : undefined}
                empty={bankCaseStudiesEmpty(emptyView)}
              />
            )}
            <CreateCaseStudyForm action={createCaseStudyInBank.bind(null, bank.id)} />
          </section>
          <PracticeSection
            headingClassName="font-read text-2xl text-ink-1"
            intro="A class you share with sees each answer and rationale as it practices."
            shares={shares}
            options={classes}
            list={{
              label: "Shared for practice",
              stopActionFor: (classId) => stopSharing.bind(null, bank.id, classId),
              stopLabelFor: (entry) => `Stop sharing with ${entry.name}`,
              warningFor: (entry) => stopSharingWarning(entry.name, bank.name),
              emptyMessage: "Not shared with any class.",
            }}
            form={{
              action: shareBankWithClass.bind(null, bank.id),
              label: "Class",
              emptyMessage:
                classes && classes.length === 0
                  ? "Create a class to share this quiz with."
                  : "Shared with every class.",
            }}
          />
          {/* Closed until asked for (#412): most visits to a quiz are not to import into it. */}
          {aiImport ? (
            // #345: beside Import JSON, only where AI import is on for the deployment and workspace.
            <div className="border-t border-line pt-6">
              <Link
                href={`/author/banks/${bank.id}/ai-import`}
                className="tap-target inline-flex items-center text-sm font-medium text-accent-ink underline"
              >
                Import with AI
              </Link>
            </div>
          ) : null}
          <details className="border-t border-line pt-6">
            <summary className="tap-target flex cursor-pointer items-center text-sm font-medium text-ink-2">
              Import JSON
            </summary>
            <div className="mt-3">
              <ImportJsonForm
                action={importIntoBank.bind(null, bank.id)}
                folders={folders}
                defaultFolderId={folder?.id}
              />
            </div>
          </details>
          <details className="border-t border-line pt-6">
            <summary className="tap-target flex cursor-pointer items-center text-sm font-medium text-ink-2">
              Rename quiz
            </summary>
            <div className="mt-3">
              <CreateBankForm
                action={renameBank.bind(null, bank.id)}
                initialName={bank.name}
                submitLabel="Save name"
              />
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
