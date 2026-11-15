import { CLASSES_PATH } from "@/lib/classes/classes";
import { practiceWarning, type PracticeExposure } from "@/lib/practice/shares";
import { AssignmentForm, type AssignmentFormProps } from "./AssignmentForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader
        className="mb-6"
        back={{ href: backHref, label: backLabel }}
        label="Assign"
        title={sourceName}
        lead="Later edits won’t change this assignment."
      />
      <PracticeNote exposure={exposure} />
      {classes === null ? (
        // Drawn with the page, so the alert's look without the live region (docs/04 §11).
        <Notice role="alert" live={false}>
          Your classes could not be loaded. Reload the page to try again.
        </Notice>
      ) : classes.length === 0 ? (
        // Right under the Assign page's h1.
        <EmptyState
          level={2}
          heading="No class to assign to yet"
          action={{ href: CLASSES_PATH, label: "Create a class" }}
        />
      ) : (
        <AssignmentForm action={action} classes={classes} submitLabel="Assign" />
      )}
    </>
  );
}
