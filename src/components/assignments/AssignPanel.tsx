import Link from "next/link";
import { CLASSES_PATH } from "@/lib/classes/classes";
import { practiceWarning, type PracticeExposure } from "@/lib/practice/shares";
import { AssignmentForm, type AssignmentFormProps } from "./AssignmentForm";

const COULD_NOT_CHECK = "Could not check whether students can see these answers in practice.";

/** #240: warn, never block, when practice has already shown some of these answers. */
function PracticeNote({ exposure }: { exposure: PracticeExposure | null }) {
  const text = exposure === null ? COULD_NOT_CHECK : practiceWarning(exposure);
  if (!text) return null;
  return (
    <p
      role="note"
      className="mb-6 max-w-prose border-l-2 border-line-strong bg-surface-2 px-3 py-2 text-ink-1"
    >
      {text}
    </p>
  );
}

export interface AssignPanelProps {
  /** The bank's or case study's name. */
  sourceName: string;
  /** Where "Back" goes: the bank or the case study. */
  backHref: string;
  backLabel: string;
  /** The org's classes, or null when they could not be read. */
  classes: readonly { id: string; name: string }[] | null;
  action: AssignmentFormProps["action"];
  /** Which classes can see some of these answers in practice; null when it could not be read. */
  exposure: PracticeExposure | null;
}

const linkClass =
  "tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline";

/** The Assign page for a bank or a case study (#207): pick a class, a window and attempts. */
export function AssignPanel({
  sourceName,
  backHref,
  backLabel,
  classes,
  action,
  exposure,
}: AssignPanelProps) {
  return (
    <>
      <Link href={backHref} className={`${linkClass} mb-4`}>
        {backLabel}
      </Link>
      <p className="eyebrow mb-1">Assign</p>
      <h1 className="mb-2 font-read text-3xl break-words text-ink-1">{sourceName}</h1>
      <p className="mb-6 max-w-prose text-ink-2">
        Students in the class see it from the open time until the close time, in their own time
        zone. What it contains is fixed now: later edits to it do not change this assignment.
      </p>
      <PracticeNote exposure={exposure} />
      {classes === null ? (
        <p role="alert" className="text-ink-2">
          Your classes could not be loaded. Reload the page to try again.
        </p>
      ) : classes.length === 0 ? (
        <p className="text-ink-2">
          There is no class to assign to yet.{" "}
          <Link href={CLASSES_PATH} className="text-accent-ink underline underline-offset-4">
            Create a class
          </Link>{" "}
          first.
        </p>
      ) : (
        <AssignmentForm action={action} classes={classes} submitLabel="Assign" />
      )}
    </>
  );
}
