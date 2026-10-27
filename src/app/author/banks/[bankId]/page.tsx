import type { Metadata } from "next";
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
import { FolderBreadcrumbs } from "@/components/authoring/FolderBreadcrumbs";
import { ItemList } from "@/components/authoring/ItemList";
import { QuizFolderPanel } from "@/components/authoring/QuizFolderPanel";
import { QuizPageHeader } from "@/components/authoring/QuizPageHeader";
import { QuizSidePanel } from "@/components/authoring/QuizSidePanel";
import { TextLink } from "@/components/ui/TextLink";
import { PracticeSection } from "@/components/practice/PracticeSection";
import { QuizMoveForm } from "@/components/authoring/QuizMoveForm";
import { Pager } from "@/components/authoring/Pager";
import { TagFilterBar } from "@/components/authoring/TagFilterBar";
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
import { itemCountLabel } from "@/lib/authoring/format";
import {
  countLabel,
  folderTrail,
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
import { LIVE_CLASS_REFUSAL } from "@/lib/live/liveStart";
import { stopSharingWarning } from "@/lib/practice/shares";
import { listClasses } from "@/lib/supabase/classes";
import { listBankShares } from "@/lib/supabase/practiceShares";
import {
  createCaseStudyInBank,
  createFolderInBank,
  deleteFolderInBank,
  moveToFolderInBank,
  renameBank,
  renameFolderInBank,
} from "../../actions";
import { moveToQuizAction, turnFolderIntoQuizAction } from "../../quizMoveActions";

export const metadata: Metadata = { title: "Quiz" };

const MOVE_FORM_ID = "move-to-folder";
const PRACTICE_ID = "practice";

/** Why a live session could not start, carried back on the query string by startLiveSession. */
function liveStartMessage(value: string | string[] | undefined): string | undefined {
  const reason = Array.isArray(value) ? value[0] : value;
  if (reason === undefined) return undefined;
  if (reason === "empty") return "Publish a question in this quiz before starting a live session.";
  if (reason === "gone") return "That quiz no longer exists.";
  if (reason === "class") return LIVE_CLASS_REFUSAL;
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
  // The form stays when the list is empty, so archiving the last rows still says what happened.
  const canArchive = !archived;
  const selectionFormId = canMove || canArchive ? MOVE_FORM_ID : undefined;
  const archiveFormId = canArchive ? MOVE_FORM_ID : undefined;
  // #266: what each list says when it is empty, most specific reason first.
  const emptyView = { bankId: bank.id, view, filter, page };
  const liveRefusal = liveStartMessage(query.live);

  const summary =
    view.kind === "all" && !searching && !tagFiltered && !archived
      ? [
          itemCountLabel(itemPage.total),
          countLabel(caseStudies.length, "case study", "case studies"),
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <div className="flex flex-col gap-8">
      <QuizPageHeader
        crumbs={
          <FolderBreadcrumbs
            bankId={bank.id}
            bankName={bank.name}
            trail={trail}
            view={view}
            libraryTrail={libraryTrail}
          />
        }
        heading={heading}
        sharedWith={(shares ?? []).map((entry) => entry.name)}
        summary={summary}
        start={startLiveSession.bind(null, bank.id)}
        assignHref={assignmentPath({ kind: "bank", id: bank.id })}
        practiceHref={`#${PRACTICE_ID}`}
        liveRefusal={liveRefusal}
        classes={classes}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] xl:gap-10">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="items-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 id="items-heading" className="font-read text-title text-ink-1">
                {archived ? "Archived questions" : "Questions"}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* #468: one order for the quiz's questions and case studies, on its own screen. */}
                {archived ? null : (
                  <TextLink href={`/author/banks/${bank.id}/order`} size="sm">
                    Change order
                  </TextLink>
                )}
                <ArchiveViewSwitch bankId={bank.id} view={view} filter={filter} />
              </div>
            </div>
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
                hasRows={hasContent}
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
            <h2 id="case-studies-heading" className="font-read text-title text-ink-1">
              {archived ? "Archived case studies" : "Case studies"}
            </h2>
            {tagFiltered || search.type ? (
              <p className="text-ink-2">Case studies are hidden while filtering.</p>
            ) : (
              <CaseStudyList
                caseStudies={caseStudies}
                moveFormId={selectionFormId}
                archiveFormId={archiveFormId}
                restoreAction={archived ? (id) => restoreCaseStudyAction.bind(null, id) : undefined}
                empty={bankCaseStudiesEmpty(emptyView)}
              />
            )}
          </section>
          <div id={PRACTICE_ID} className="scroll-mt-4">
            <PracticeSection
              headingClassName="font-read text-title text-ink-1"
              intro=""
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
          </div>
        </div>

        <QuizSidePanel
          newQuestionHref={`/author/banks/${bank.id}/new`}
          newCaseStudy={<CreateCaseStudyForm action={createCaseStudyInBank.bind(null, bank.id)} />}
          aiImportHref={aiImport ? `/author/banks/${bank.id}/ai-import` : undefined}
          folders={
            inQuizFolders ? (
              <QuizFolderPanel
                bankId={bank.id}
                folders={folders}
                view={view}
                filter={filter}
                folder={folder ?? null}
                depth={trail.length}
                turnInto={
                  knowsUses && folder
                    ? {
                        action: turnFolderIntoQuizAction.bind(null, bank.id, folder.id),
                        quizName: newQuizName(folder.name, [
                          bank.name,
                          ...otherQuizzes.map((quiz) => quiz.name),
                        ]),
                        staysBehind: keptLines,
                      }
                    : undefined
                }
                createFolder={createFolderInBank.bind(null, bank.id, folder?.id ?? null)}
                renameFolder={
                  folder ? renameFolderInBank.bind(null, bank.id, folder.id) : undefined
                }
                deleteFolder={
                  folder ? deleteFolderInBank.bind(null, bank.id, folder.id) : undefined
                }
              />
            ) : null
          }
          more={
            <>
              <p className="text-sm font-semibold text-ink-1">Rename quiz</p>
              <CreateBankForm
                action={renameBank.bind(null, bank.id)}
                initialName={bank.name}
                submitLabel="Save name"
              />
            </>
          }
        />
      </div>
    </div>
  );
}
