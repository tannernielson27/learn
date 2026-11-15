import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import type { LibraryRailEntry } from "@/lib/authoring/libraryFolders";
import { CreateBankForm, type CreateBankFormProps } from "./CreateBankForm";
import { Breadcrumbs, type Crumb } from "./FolderBreadcrumbs";
import { LibraryRail } from "./LibraryRail";
import { QuizSearch, QuizSearchField } from "./QuizSearch";

/** Where the library's one way to make a quiz is: Get started and an empty list link here. */
export const NEW_QUIZ_HEADING_ID = "new-bank-heading";

export interface LibraryFrameProps {
  /** "Library", or the open folder's name. */
  title: string;
  /** How many quizzes the open view lists; none when the list is empty and says so itself. */
  lead?: string | null;
  /** The way back up, inside a folder. */
  crumbs?: readonly Crumb[] | null;
  /** Makes a quiz in the open view: at the top, or in the open folder. */
  createQuiz: CreateBankFormProps["action"];
  /** Keys the create form by the open view, so a half-typed name never follows into another. */
  createKey: string;
  /** Every quiz name the open view lists, for the search; with none, no search is offered. */
  names: readonly string[];
  /** The folder rail's entries, or null while there is no folder to choose between. */
  rail: readonly LibraryRailEntry[] | null;
  /** New folder and the open folder's controls: under the rail, or beside the list without one. */
  folderControls?: ReactNode;
  /** What comes before the list at the top of the library: Get started, the welcome, a notice. */
  intro?: ReactNode;
  /** The move form and the list itself. */
  children: ReactNode;
}

/**
 * The library's frame (#411, #563): the title on `PageHeader` with the one way to make a quiz as
 * its main action, the folder rail once there is a folder, and the list under its search.
 *
 * One create path. The New quiz form is the header's action, in the first screen at 375px, so
 * there is no second "New quiz" button to reach it, and no fixed bar on a phone. Get started's
 * "Write your own" and the empty list's "New quiz" are links to it, not other forms.
 *
 * With no folders yet there is no rail: New folder sits beside the search instead, and the list
 * takes the whole width.
 */
export function LibraryFrame({
  title,
  lead,
  crumbs,
  createQuiz,
  createKey,
  names,
  rail,
  folderControls,
  intro,
  children,
}: LibraryFrameProps) {
  const newQuiz = (
    // As wide as a quiz name needs, and never wider than the column on a phone.
    <section
      aria-labelledby={NEW_QUIZ_HEADING_ID}
      className="w-[min(26rem,calc(100vw-2*var(--shell-gutter,1rem)))]"
    >
      {/* The label names the field; the heading names the region and is where links land. */}
      <h2 id={NEW_QUIZ_HEADING_ID} className="sr-only">
        New quiz
      </h2>
      <CreateBankForm key={`new-quiz-${createKey}`} action={createQuiz} inline />
    </section>
  );
  const toolbarControls = rail ? null : folderControls;
  const searchable = names.length > 0;

  return (
    <QuizSearch names={names}>
      <div
        className={
          rail
            ? "grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10"
            : "flex flex-col gap-6"
        }
      >
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {crumbs ? <Breadcrumbs crumbs={crumbs} /> : null}
          {/* Classes, live sessions and the workspace are in the layout's navigation (#412). */}
          <PageHeader title={title} lead={lead ?? undefined} action={newQuiz} />
        </div>

        {rail ? (
          <aside className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:border-r lg:border-line lg:pr-4">
            <LibraryRail entries={rail} />
            {folderControls}
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-2">
          {intro}
          <div className="flex flex-col gap-4">
            {searchable || toolbarControls ? (
              <div className="flex flex-wrap items-start justify-between gap-3">
                {searchable ? <QuizSearchField className="w-full sm:w-72" /> : null}
                {toolbarControls ? (
                  <div className="min-w-0 sm:ml-auto">{toolbarControls}</div>
                ) : null}
              </div>
            ) : null}
            {children}
          </div>
        </div>
      </div>
    </QuizSearch>
  );
}
