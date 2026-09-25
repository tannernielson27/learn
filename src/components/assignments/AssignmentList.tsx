import Link from "next/link";
import { ConfirmSubmit } from "@/components/classes/ConfirmSubmit";
import {
  assignmentReportPath,
  assignmentState,
  attemptsLabel,
  STATE_LABEL,
  type AssignmentState,
} from "@/lib/assignments/assignments";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import { AssignmentForm, type AssignmentFormProps } from "./AssignmentForm";
import { LazyDetails } from "./LazyDetails";
import { LocalTime } from "./LocalTime";
import { EmptyState } from "@/components/ui/EmptyState";

export interface AssignmentListProps {
  assignments: readonly AssignmentSummary[];
  /** When the page was rendered: decides each assignment's state. */
  now: Date;
  /** The edit Server Function bound to one assignment; `closeOnly` once it has opened. Never
   * asked for one that has closed. */
  editActionFor: (assignmentId: string, closeOnly: boolean) => AssignmentFormProps["action"];
  /** The delete Server Function bound to one assignment that has not opened. */
  deleteActionFor: (assignmentId: string) => (formData: FormData) => Promise<void>;
  /**
   * The id of the focusable heading above the list. A confirmed Delete takes the row and its
   * button off the page, so focus goes here rather than to the document body (#288).
   */
  focusAfterDelete?: string;
}

const STATE_CLASS: Readonly<Record<AssignmentState, string>> = {
  scheduled: "border-line text-ink-2",
  open: "border-accent text-accent-ink",
  closed: "border-line bg-surface-2 text-ink-2",
};

/** A class's assignments for its author: each one's state, window and attempts, and its edits. */
export function AssignmentList({
  assignments,
  now,
  editActionFor,
  deleteActionFor,
  focusAfterDelete,
}: AssignmentListProps) {
  if (assignments.length === 0) {
    // Under the class page's Assignments h2.
    return (
      <EmptyState
        level={3}
        heading="No assignments yet"
        body="Assign a bank or a case study to this class from its page."
        action={{ href: "/author", label: "Go to your item banks" }}
      />
    );
  }

  return (
    <ul
      aria-label="Assignments"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {assignments.map((entry) => (
        <AssignmentRow
          key={entry.id}
          entry={entry}
          state={assignmentState(entry.opensAt, entry.closesAt, now)}
          editActionFor={editActionFor}
          deleteActionFor={deleteActionFor}
          focusAfterDelete={focusAfterDelete}
        />
      ))}
    </ul>
  );
}

interface AssignmentRowProps extends Pick<
  AssignmentListProps,
  "editActionFor" | "deleteActionFor" | "focusAfterDelete"
> {
  entry: AssignmentSummary;
  state: AssignmentState;
}

function AssignmentRow({
  entry,
  state,
  editActionFor,
  deleteActionFor,
  focusAfterDelete,
}: AssignmentRowProps) {
  const scheduled = state === "scheduled";
  const reportLabel = state === "closed" ? "View report" : "View progress";
  return (
    <li className="flex flex-col gap-3 px-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="min-w-0 font-medium break-words text-ink-1">{entry.title}</span>
        <span className={`rounded-sm border px-2 text-sm ${STATE_CLASS[state]}`}>
          {STATE_LABEL[state]}
        </span>
      </div>
      <div className="flex flex-col gap-1 text-sm text-ink-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
        <dl className="flex flex-col gap-1 sm:flex-row sm:gap-x-6">
          <div className="flex gap-1">
            <dt>Opens </dt>
            <dd className="text-ink-1">
              <LocalTime iso={entry.opensAt} />
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Closes </dt>
            <dd className="text-ink-1">
              <LocalTime iso={entry.closesAt} />
            </dd>
          </div>
        </dl>
        <p>{attemptsLabel(entry.maxAttempts)}</p>
      </div>
      {/* #211: progress while it is open, scores once it has closed. Nothing to see before. */}
      {scheduled ? null : (
        <Link
          href={assignmentReportPath(entry.id)}
          aria-label={`${reportLabel} for ${entry.title}`}
          className="tap-target inline-flex items-center self-start text-sm font-medium text-accent-ink hover:underline"
        >
          {reportLabel}
        </Link>
      )}
      {/* A closed assignment is final: its keys may already be in front of students (#210). */}
      {state === "closed" ? null : (
        <LazyDetails
          summary={
            <>
              {scheduled ? "Edit" : "Change close time"}
              <span className="sr-only"> for {entry.title}</span>
            </>
          }
        >
          <AssignmentForm
            action={editActionFor(entry.id, !scheduled)}
            initial={entry}
            closeOnly={!scheduled}
            submitLabel={scheduled ? "Save changes" : "Save close time"}
          />
        </LazyDetails>
      )}
      {scheduled ? (
        <ConfirmSubmit
          action={deleteActionFor(entry.id)}
          label="Delete"
          ariaLabel={`Delete ${entry.title}`}
          confirmLabel="Delete assignment"
          warning="It has not opened, so no student has seen it. This cannot be undone."
          focusOnSuccess={focusAfterDelete}
        />
      ) : null}
    </li>
  );
}
