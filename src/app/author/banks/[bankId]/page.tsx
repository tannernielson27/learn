import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  archiveSelectedAction,
  restoreCaseStudyAction,
  restoreItemAction,
} from "@/app/author/archiveActions";
import { ActiveFilters, activeFilterCount } from "@/components/authoring/ActiveFilters";
import { ArchiveViewSwitch } from "@/components/authoring/ArchiveViewSwitch";
import { BankSearchForm } from "@/components/authoring/BankSearchForm";
import { CaseStudyList } from "@/components/authoring/CaseStudyList";
import { CreateBankForm } from "@/components/authoring/CreateBankForm";
import { CreateCaseStudyForm } from "@/components/authoring/CreateCaseStudyForm";
import { FolderBreadcrumbs } from "@/components/authoring/FolderBreadcrumbs";
import { ItemList } from "@/components/authoring/ItemList";
import { QuizFolderPanel } from "@/components/authoring/QuizFolderPanel";
import { QuizPageHeader } from "@/components/authoring/QuizPageHeader";
import {
  PRACTICE_HEADING_CLASSES,
  PRACTICE_ID,
  QuizPageFrame,
} from "@/components/authoring/QuizPageFrame";
import { NEW_CASE_STUDY_ID, QuizSidePanel } from "@/components/authoring/QuizSidePanel";
import { TextLink } from "@/components/ui/TextLink";
import { PracticeSection } from "@/components/practice/PracticeSection";
import { QuizMoveForm } from "@/components/authoring/QuizMoveForm";
import { Pager } from "@/components/authoring/Pager";
import { TagFilterBar } from "@/components/authoring/TagFilterBar";
import { startLiveSession } from "@/app/live/actions";
import { shareBankWithClass, stopSharing } from "@/app/author/practice/actions";
import { aiImportEnabled } from "@/lib/aiImport/config";
import { workspaceEnabled, type Client as AiImportClient } from "@/lib/aiImport/upload/access";
import { readOpenImports } from "@/lib/aiImport/upload/openImports";
import { describeOpenImport } from "@/lib/authoring/aiImportUpload";
import { assignmentPath } from "@/lib/assignments/assignments";
import { bankCaseStudiesEmpty, bankItemsEmpty, emptyQuizSteps } from "@/lib/authoring/bankEmpty";
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
  // #591: an import left unfinished or in review is listed with the way back to it. Read with
  // the teacher's own session, for this quiz only; statuses and counts, never a question.
  const openImportsRead = aiImportOn.then((on) =>
    on ? readOpenImports(supabase as unknown as AiImportClient, author.orgId, bankId) : [],
  );
  openImportsRead.catch(() => undefined);
  // perf-audit #13: the quiz row, its folders and the reads that do not depend on the view all
  // start together. Each is a read of this quiz under RLS, so for a quiz this author cannot see
  // they find nothing; the row is still awaited first, so that quiz is a 404 as before.
  const bankRead = supabase.from("item_banks").select("id, name").eq("id", bankId).maybeSingle();
  // #411: a quiz offers folders inside it only if it already has one. Without any, every view is
  // the whole quiz, so a stale "Not in a folder" link still lists everything.
  const foldersRead = listFolders(supabase, bankId);
  const besideFolders = Promise.all([
    quizLibraryTrail(supabase, bankId),
    listBankShares(supabase, bankId),
    listClasses(supabase),
    readMoveContext(supabase, bankId),
  ]);
  // Awaited below; this only keeps a failure from going unobserved if the page stops first.
  foldersRead.catch(() => undefined);
  besideFolders.catch(() => undefined);
  const { data: bank } = await bankRead;
  if (!bank) notFound();

  const folders = await foldersRead;
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
  const openImports = await openImportsRead.catch(() => []);
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
  // #563: an empty quiz's lists name every way to fill it: write, import with AI, a case study.
  const emptySteps = emptyQuizSteps({
    bankId: bank.id,
    aiImport,
    caseStudyHref: `#${NEW_CASE_STUDY_ID}`,
  });

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
    <QuizPageFrame
      header={
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
      }
      archived={archived}
      listTools={
        <>
          {/* #468: one order for the quiz's questions and case studies, on its own screen. */}
          {archived ? null : (
            <TextLink href={`/author/banks/${bank.id}/order`} size="sm">
              Change order
            </TextLink>
          )}
          <ArchiveViewSwitch bankId={bank.id} view={view} filter={filter} />
        </>
      }
      search={
        <>
          <BankSearchForm
            bankId={bank.id}
            view={view}
            filter={filter}
            activeCount={activeFilterCount(filter)}
            tags={<TagFilterBar bankId={bank.id} view={view} filter={filter} facets={facets} />}
          />
          <ActiveFilters bankId={bank.id} view={view} filter={filter} matching={facets.matching} />
          {searching ? (
            <p role="status" className="text-ink-1">
              {searchSummary(itemPage.total, search)}
            </p>
          ) : null}
        </>
      }
      questions={
        <>
          <ItemList
            items={items}
            moveFormId={selectionFormId}
            archiveFormId={archiveFormId}
            restoreAction={archived ? (id) => restoreItemAction.bind(null, id) : undefined}
            empty={bankItemsEmpty(emptyView, emptySteps)}
          />
          <Pager
            page={page}
            pageCount={itemPage.pageCount}
            hrefFor={(target) => bankViewHref(bank.id, view, filter, target)}
          />
        </>
      }
      caseStudies={
        tagFiltered || search.type ? (
          <p className="text-ink-2">Case studies are hidden while filtering.</p>
        ) : (
          <CaseStudyList
            caseStudies={caseStudies}
            moveFormId={selectionFormId}
            archiveFormId={archiveFormId}
            restoreAction={archived ? (id) => restoreCaseStudyAction.bind(null, id) : undefined}
            empty={bankCaseStudiesEmpty(emptyView, emptySteps)}
          />
        )
      }
      selection={
        selectionFormId ? (
          // Last in the column, so the bar it opens into sticks to the window's foot under the
          // lists and appears without moving a row (#563).
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
        ) : null
      }
      practice={
        <PracticeSection
          headingClassName={PRACTICE_HEADING_CLASSES}
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
      }
      side={
        <QuizSidePanel
          newQuestionHref={`/author/banks/${bank.id}/new`}
          newCaseStudy={<CreateCaseStudyForm action={createCaseStudyInBank.bind(null, bank.id)} />}
          aiImportHref={aiImport ? `/author/banks/${bank.id}/ai-import` : undefined}
          openImports={openImports.map((open) => describeOpenImport(bank.id, open))}
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
      }
    />
  );
}
