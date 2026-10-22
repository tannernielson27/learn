import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, type EmptyStateContent } from "@/components/ui/EmptyState";
import { NO_CASE_STUDIES_YET } from "@/lib/authoring/bankEmpty";
import type { CaseStudySummary } from "@/lib/authoring/banks";
import { formatEdited } from "@/lib/authoring/format";
import { ArchiveButton, type ArchiveButtonProps } from "./ArchiveButton";
import { ArchiveRowButton } from "./ArchiveRowButton";
import { SelectForMove } from "./SelectForMove";

export interface CaseStudyListProps {
  caseStudies: readonly CaseStudySummary[];
  /** What an empty list says, under the page's Case studies h2; defaults to the empty quiz's line. */
  empty?: EmptyStateContent;
  /** The id of a move form: each case study gets a checkbox that joins it. */
  moveFormId?: string;
  /** In the Archived view: the restore action for a case study, so each row offers Restore. */
  restoreAction?: (caseStudyId: string) => ArchiveButtonProps["action"];
  /** The selection form a row's own Archive sends (#471); without one, no Archive. */
  archiveFormId?: string;
}

const STATUS_LABELS: Record<CaseStudySummary["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/** A quiz's case studies, each linking to its page, with how many of its six steps are placed. */
export function CaseStudyList({
  caseStudies,
  empty = NO_CASE_STUDIES_YET,
  moveFormId,
  restoreAction,
  archiveFormId,
}: CaseStudyListProps) {
  if (caseStudies.length === 0) {
    return <EmptyState level={3} {...empty} />;
  }
  return (
    <ul
      aria-label="Case studies"
      className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-1"
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
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
              <Badge tone={caseStudy.status === "draft" ? "accent" : "neutral"}>
                {STATUS_LABELS[caseStudy.status]}
              </Badge>
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
          {archiveFormId ? (
            <ArchiveRowButton
              formId={archiveFormId}
              kind="caseStudy"
              id={caseStudy.id}
              name={caseStudy.title}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
