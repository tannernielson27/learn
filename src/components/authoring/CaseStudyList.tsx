import Link from "next/link";
import type { CaseStudySummary } from "@/lib/authoring/banks";
import { formatEdited } from "@/lib/authoring/format";
import { ArchiveButton, type ArchiveButtonProps } from "./ArchiveButton";
import { SelectForMove } from "./SelectForMove";

export interface CaseStudyListProps {
  caseStudies: readonly CaseStudySummary[];
  /** Shown when there are no case studies; defaults to the empty-bank hint. */
  emptyMessage?: string;
  /** The id of a move form: each case study gets a checkbox that joins it. */
  moveFormId?: string;
  /** In the Archived view: the restore action for a case study, so each row offers Restore. */
  restoreAction?: (caseStudyId: string) => ArchiveButtonProps["action"];
}

const STATUS_LABELS: Record<CaseStudySummary["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/** A bank's case studies, each linking to its page, with how many of its six steps are placed. */
export function CaseStudyList({
  caseStudies,
  emptyMessage = "No case studies in this bank yet.",
  moveFormId,
  restoreAction,
}: CaseStudyListProps) {
  if (caseStudies.length === 0) {
    return <p className="text-ink-2">{emptyMessage}</p>;
  }
  return (
    <ul
      aria-label="Case studies"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {caseStudies.map((caseStudy) => (
        <li key={caseStudy.id} className="flex items-stretch">
          {moveFormId ? (
            <SelectForMove
              formId={moveFormId}
              name="caseStudy"
              value={caseStudy.id}
              label={`Select ${caseStudy.title}`}
            />
          ) : null}
          <Link
            href={`/author/case-studies/${caseStudy.id}`}
            className="tap-target flex min-w-0 flex-1 flex-col gap-1 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
          >
            <span className="text-ink-1">{caseStudy.title}</span>
            <span className="flex flex-wrap gap-x-3 text-sm text-ink-2">
              <span>{STATUS_LABELS[caseStudy.status]}</span>
              <span>{`${Math.min(caseStudy.stepCount, 6)} of 6 steps`}</span>
              <span>{formatEdited(caseStudy.updatedAt)}</span>
            </span>
          </Link>
          {restoreAction ? (
            <div className="flex shrink-0 items-center px-2">
              <ArchiveButton
                action={restoreAction(caseStudy.id)}
                label="Restore"
                accessibleName={`Restore ${caseStudy.title}`}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
