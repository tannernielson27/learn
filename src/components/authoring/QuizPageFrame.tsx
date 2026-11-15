import type { ReactNode } from "react";

/** The Practice section's anchor, which the header's Share for practice jumps to. */
export const PRACTICE_ID = "practice";

const SECTION_HEADING = "font-read text-title text-ink-1";

export interface QuizPageFrameProps {
  /** `QuizPageHeader`: the breadcrumbs, the quiz's name and its ways of being used. */
  header: ReactNode;
  /** In the Archived view the lists are the archived ones, and say so. */
  archived: boolean;
  /** Beside the Questions heading: Change order, and Current or archived. */
  listTools: ReactNode;
  /** The one search row and what it is filtered by: `BankSearchForm`, `ActiveFilters`. */
  search: ReactNode;
  /** The question list and its pager. */
  questions: ReactNode;
  /** The case study list, or the line that says it is hidden while filtering. */
  caseStudies: ReactNode;
  /** The selection form (`QuizMoveForm`), whose bar sticks to the window's foot under the lists. */
  selection?: ReactNode;
  /** The Practice section. */
  practice: ReactNode;
  /** `QuizSidePanel`. */
  side: ReactNode;
}

/**
 * The quiz page's frame (#563), drawn by the page and by `/gallery/quiz-page` from the same parts:
 * the header, then the questions straight after the one search row, with the side panel beside
 * them from 1024px and under everything below that.
 *
 * Nothing between the header and the first question but its heading, the search row and any
 * filter chips, so a quiz's first question is in the first screen at 1280x800 and soon after the
 * header on a phone. The selection form comes last in the column: the bar it opens into sticks to
 * the foot of the window, so selecting a row never moves the rows.
 */
export function QuizPageFrame({
  header,
  archived,
  listTools,
  search,
  questions,
  caseStudies,
  selection,
  practice,
  side,
}: QuizPageFrameProps) {
  return (
    <div className="flex flex-col gap-8">
      {header}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] xl:gap-10">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="items-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 id="items-heading" className={SECTION_HEADING}>
                {archived ? "Archived questions" : "Questions"}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{listTools}</div>
            </div>
            {search}
            {questions}
          </section>
          <section aria-labelledby="case-studies-heading" className="flex flex-col gap-4">
            <h2 id="case-studies-heading" className={SECTION_HEADING}>
              {archived ? "Archived case studies" : "Case studies"}
            </h2>
            {caseStudies}
          </section>
          {selection}
          <div id={PRACTICE_ID} className="scroll-mt-4">
            {practice}
          </div>
        </div>
        {side}
      </div>
    </div>
  );
}

/** The Practice section's heading, the size of the page's other section headings. */
export const PRACTICE_HEADING_CLASSES = SECTION_HEADING;
