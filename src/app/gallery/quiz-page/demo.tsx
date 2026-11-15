"use client";

import { ActiveFilters, activeFilterCount } from "@/components/authoring/ActiveFilters";
import { ArchiveButton } from "@/components/authoring/ArchiveButton";
import { ArchiveViewSwitch } from "@/components/authoring/ArchiveViewSwitch";
import { BankSearchForm } from "@/components/authoring/BankSearchForm";
import { CaseStudyList } from "@/components/authoring/CaseStudyList";
import { CreateCaseStudyForm } from "@/components/authoring/CreateCaseStudyForm";
import { DuplicateButton } from "@/components/authoring/DuplicateButton";
import { editorFor } from "@/components/authoring/editorFor";
import { FolderBreadcrumbs } from "@/components/authoring/FolderBreadcrumbs";
import { ItemEditorWithHistory } from "@/components/authoring/ItemEditorWithHistory";
import { ItemList } from "@/components/authoring/ItemList";
import { ItemPageHeader } from "@/components/authoring/ItemPageHeader";
import { QuizMoveForm } from "@/components/authoring/QuizMoveForm";
import {
  PRACTICE_HEADING_CLASSES,
  PRACTICE_ID,
  QuizPageFrame,
} from "@/components/authoring/QuizPageFrame";
import { QuizPageHeader } from "@/components/authoring/QuizPageHeader";
import { NEW_CASE_STUDY_ID, QuizSidePanel } from "@/components/authoring/QuizSidePanel";
import { TagFilterBar } from "@/components/authoring/TagFilterBar";
import { PracticeSection } from "@/components/practice/PracticeSection";
import { TextLink } from "@/components/ui/TextLink";
import { bankCaseStudiesEmpty, bankItemsEmpty, emptyQuizSteps } from "@/lib/authoring/bankEmpty";
import { NO_BANK_FILTER, searchSummary, type BankFilter } from "@/lib/authoring/bankSearch";
import { itemCountLabel } from "@/lib/authoring/format";
import { countLabel, type FolderView } from "@/lib/authoring/folders";
import {
  QUIZ_FIXTURE_CASE_STUDIES,
  QUIZ_FIXTURE_CLASSES,
  QUIZ_FIXTURE_ID,
  QUIZ_FIXTURE_ITEMS,
  QUIZ_FIXTURE_NAME,
  QUIZ_FIXTURE_TAGGED,
} from "@/lib/authoring/quizPageFixture";
import { bankViewHref, isFiltering, tagFacets } from "@/lib/authoring/tagFilter";
import { ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import { FIXTURES } from "@/lib/ngn/fixtures";

/** What the gallery draws: the quiz page in four states, and the question editor's frame. */
export type QuizPageDemoState =
  "questions" | "empty" | "filtered" | "no-results" | "editor" | "editor-problems";

const NOT_HERE = "Not in the gallery.";
const notHere = async () => ({ status: "error" as const, error: NOT_HERE });
const nothing = async () => {};
const ALL: FolderView = { kind: "all" };
const BANK = QUIZ_FIXTURE_ID;

function filterFor(state: QuizPageDemoState): BankFilter {
  if (state === "filtered") return { ...NO_BANK_FILTER, step: 1, type: "multiple_choice" };
  if (state === "no-results") return { ...NO_BANK_FILTER, query: "digoxin" };
  return NO_BANK_FILTER;
}

/**
 * The quiz page as `src/app/author/banks/[bankId]/page.tsx` draws it, from `quizPageFixture.ts`
 * with every action answering that it is not available here; or, for `editor` and
 * `editor-problems`, the question page's frame around the real editor, opened on a gallery
 * fixture (the editor is the author's own screen, so it holds the key, as the item pages do).
 */
export function QuizPageDemo({ state }: { state: QuizPageDemoState }) {
  if (state === "editor" || state === "editor-problems") return <EditorDemo state={state} />;

  const filter = filterFor(state);
  const items =
    state === "empty" || state === "no-results"
      ? []
      : state === "filtered"
        ? QUIZ_FIXTURE_ITEMS.filter(
            (item) => item.cjmmStep === 1 && item.type === "multiple_choice",
          )
        : [...QUIZ_FIXTURE_ITEMS];
  const caseStudies = state === "questions" ? [...QUIZ_FIXTURE_CASE_STUDIES] : [];
  const facets = tagFacets(state === "empty" ? [] : QUIZ_FIXTURE_TAGGED, filter);
  const tagFiltered = isFiltering(filter);
  const searching = Boolean(filter.query || filter.type || filter.status);
  const emptyView = { bankId: BANK, view: ALL, filter, page: 1 };
  const steps = emptyQuizSteps({
    bankId: BANK,
    aiImport: true,
    caseStudyHref: `#${NEW_CASE_STUDY_ID}`,
  });
  const summary =
    state === "questions" || state === "empty"
      ? [itemCountLabel(items.length), countLabel(caseStudies.length, "case study", "case studies")]
          .filter(Boolean)
          .join(" · ")
      : null;
  const hasRows = items.length > 0 || caseStudies.length > 0;

  return (
    <QuizPageFrame
      header={
        <QuizPageHeader
          crumbs={
            <FolderBreadcrumbs bankId={BANK} bankName={QUIZ_FIXTURE_NAME} trail={[]} view={ALL} />
          }
          heading={QUIZ_FIXTURE_NAME}
          sharedWith={state === "questions" ? ["NUR 310"] : []}
          summary={summary}
          start={nothing}
          assignHref="#assign"
          practiceHref={`#${PRACTICE_ID}`}
          classes={QUIZ_FIXTURE_CLASSES}
        />
      }
      archived={false}
      listTools={
        <>
          <TextLink href="#order" size="sm">
            Change order
          </TextLink>
          <ArchiveViewSwitch bankId={BANK} view={ALL} filter={filter} />
        </>
      }
      search={
        <>
          <BankSearchForm
            bankId={BANK}
            view={ALL}
            filter={filter}
            activeCount={activeFilterCount(filter)}
            tags={<TagFilterBar bankId={BANK} view={ALL} filter={filter} facets={facets} />}
          />
          <ActiveFilters bankId={BANK} view={ALL} filter={filter} matching={facets.matching} />
          {searching ? (
            <p role="status" className="text-ink-1">
              {searchSummary(items.length, filter)}
            </p>
          ) : null}
        </>
      }
      questions={
        <ItemList
          items={items}
          moveFormId="move-to-folder"
          archiveFormId="move-to-folder"
          empty={bankItemsEmpty(emptyView, steps)}
        />
      }
      caseStudies={
        tagFiltered || filter.type ? (
          <p className="text-ink-2">Case studies are hidden while filtering.</p>
        ) : (
          <CaseStudyList
            caseStudies={caseStudies}
            moveFormId="move-to-folder"
            archiveFormId="move-to-folder"
            empty={bankCaseStudiesEmpty(emptyView, steps)}
          />
        )
      }
      selection={
        <QuizMoveForm
          id="move-to-folder"
          folders={[]}
          quizzes={[{ id: "00000000-0000-4000-8000-0000000002b2", name: "Renal week" }]}
          moveToQuiz={notHere}
          staysBehind={["Practice with NUR 310 stays with this quiz."]}
          archive={async () => ({ status: "error", error: NOT_HERE, refusals: [] })}
          archivedHref={bankViewHref(BANK, ALL, { ...filter, status: "archived" })}
          hasRows={hasRows}
        />
      }
      practice={
        <PracticeSection
          headingClassName={PRACTICE_HEADING_CLASSES}
          intro=""
          shares={
            state === "questions"
              ? [
                  {
                    id: QUIZ_FIXTURE_CLASSES[0].id,
                    name: "NUR 310",
                    sharedAt: "2026-11-01T10:00:00Z",
                  },
                ]
              : []
          }
          options={QUIZ_FIXTURE_CLASSES}
          list={{
            label: "Shared for practice",
            stopActionFor: () => nothing,
            stopLabelFor: (entry) => `Stop sharing with ${entry.name}`,
            warningFor: (entry) => `${entry.name} will no longer see ${QUIZ_FIXTURE_NAME}.`,
            emptyMessage: "Not shared with any class.",
          }}
          form={{ action: notHere, label: "Class", emptyMessage: "Shared with every class." }}
        />
      }
      side={
        <QuizSidePanel
          newQuestionHref="#new"
          newCaseStudy={<CreateCaseStudyForm action={notHere} />}
          aiImportHref="#ai-import"
          more={<p className="text-sm text-ink-2">Rename quiz is not in the gallery.</p>}
        />
      }
    />
  );
}

const EDITOR_ITEM = "00000000-0000-4000-8000-0000000002e1";

function EditorDemo({ state }: { state: "editor" | "editor-problems" }) {
  const fixture = FIXTURES.multiple_choice.canonical;
  // Problems: the rationale and the last option's words taken away, so Publish has two reasons.
  const stored =
    state === "editor-problems"
      ? {
          ...fixture,
          rationale: undefined,
          content: {
            ...fixture.content,
            options: fixture.content.options.map((option, index) =>
              index === fixture.content.options.length - 1 ? { ...option, label: "" } : option,
            ),
          },
        }
      : fixture;
  const editor = editorFor(EDITOR_ITEM, "multiple_choice", stored);
  if (!editor) return null;
  return (
    <>
      <ItemPageHeader
        bankHref="#quiz"
        exportHref={state === "editor" ? "#export" : undefined}
        typeLabel={ITEM_TYPE_LABELS.multiple_choice}
        status={state === "editor" ? "published" : "draft"}
      />
      <ItemEditorWithHistory
        editor={editor}
        entries={[]}
        truncated={false}
        published={state === "editor"}
        more={
          <>
            <DuplicateButton action={notHere} label="Duplicate question" appearance="menu" />
            <ArchiveButton action={notHere} label="Archive question" appearance="menu" />
          </>
        }
      />
    </>
  );
}
