import Link from "next/link";
import { PracticeBadge } from "@/components/practice/PracticeBadge";
import type { BankSummary } from "@/lib/authoring/banks";
import { formatEdited, itemCountLabel } from "@/lib/authoring/format";
import { EmptyState, type EmptyStateAction } from "@/components/ui/EmptyState";
import { QuizSearchRow } from "./QuizSearch";
import { SelectForMove } from "./SelectForMove";
import { StartLiveButton } from "./StartLiveButton";

export interface BankListProps {
  banks: readonly BankSummary[];
  /** Bank id to the names of the classes it is shared with for practice (#240). */
  sharedWith?: ReadonlyMap<string, readonly string[]>;
  /** With no banks yet: where one is made, on the page that lists them. */
  emptyAction?: EmptyStateAction;
  /** The empty list's heading; "No quizzes yet" unless a folder says otherwise. */
  emptyHeading?: string;
  /** The id of a move form (#411): each quiz gets a checkbox that joins it. */
  moveFormId?: string;
  /** Bank id to the folder it is filed in, shown under its name in All quizzes. */
  folderNames?: ReadonlyMap<string, string>;
  /**
   * Starts a live session of a quiz, as the quiz page's Start a live session does (teacher-paced,
   * its default). With it, each row gets a Start button.
   */
  start?: (bankId: string) => (formData: FormData) => Promise<void>;
  /** Rows are drawn only while they match the library's search; it needs a `QuizSearch` above. */
  searchable?: boolean;
}

const NOBODY: readonly string[] = [];

/**
 * The library's quizzes (Library mockups): a card per quiz on a phone, and from 640px one ruled
 * card with a row per quiz, its name and folder, its size, its last edit and Start.
 */
export function BankList({
  banks,
  sharedWith,
  emptyAction,
  emptyHeading = "No quizzes yet",
  moveFormId,
  folderNames,
  start,
  searchable = false,
}: BankListProps) {
  if (banks.length === 0) {
    // Right under the library's h1.
    return <EmptyState level={2} heading={emptyHeading} action={emptyAction} />;
  }

  return (
    <ul
      aria-label="Quizzes"
      className="flex flex-col gap-3 sm:gap-0 sm:divide-y sm:divide-line sm:rounded-md sm:border sm:border-line sm:bg-surface-1"
    >
      {banks.map((bank) => {
        const folder = folderNames?.get(bank.id);
        const row = (
          <li
            key={bank.id}
            className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-md border border-line bg-surface-1 p-2 sm:flex-nowrap sm:rounded-none sm:border-0 sm:bg-transparent sm:px-2 sm:py-1.5"
          >
            {moveFormId ? (
              <SelectForMove
                formId={moveFormId}
                name="quiz"
                value={bank.id}
                label={`Select ${bank.name}`}
              />
            ) : null}
            <Link
              href={`/author/banks/${bank.id}`}
              className="tap-target flex min-w-0 flex-1 flex-col justify-center gap-1 rounded-sm px-2 py-2 transition-colors duration-fast hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="flex min-w-0 flex-col items-start gap-1 sm:flex-1">
                <span className="font-semibold break-words text-ink-1">{bank.name}</span>
                {folder ? <span className="text-sm text-ink-2">{folder}</span> : null}
                <PracticeBadge classNames={sharedWith?.get(bank.id) ?? NOBODY} />
              </span>
              <span className="flex flex-wrap gap-x-3 text-sm text-ink-2 sm:contents">
                <span className="sm:w-32 sm:shrink-0">{itemCountLabel(bank.itemCount)}</span>
                <span className="sm:w-40 sm:shrink-0">{formatEdited(bank.updatedAt)}</span>
              </span>
            </Link>
            {start ? (
              <form action={start(bank.id)} className="max-sm:basis-full sm:shrink-0 sm:pr-2">
                <input type="hidden" name="pacing" value="instructor_paced" />
                <StartLiveButton
                  label="Start"
                  size="sm"
                  block
                  aria-label={`Start a live session of ${bank.name}`}
                />
              </form>
            ) : null}
          </li>
        );
        return searchable ? (
          <QuizSearchRow key={bank.id} name={bank.name}>
            {row}
          </QuizSearchRow>
        ) : (
          row
        );
      })}
    </ul>
  );
}
