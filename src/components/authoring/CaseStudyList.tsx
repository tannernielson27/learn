import Link from "next/link";
import type { CaseStudySummary } from "@/lib/authoring/banks";
import { formatEdited } from "@/lib/authoring/format";

export interface CaseStudyListProps {
  caseStudies: readonly CaseStudySummary[];
}

const STATUS_LABELS: Record<CaseStudySummary["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/** A bank's case studies, each linking to its page, with how many of its six steps are placed. */
export function CaseStudyList({ caseStudies }: CaseStudyListProps) {
  if (caseStudies.length === 0) {
    return <p className="text-ink-2">No case studies in this bank yet.</p>;
  }
  return (
    <ul
      aria-label="Case studies"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {caseStudies.map((caseStudy) => (
        <li key={caseStudy.id}>
          <Link
            href={`/author/case-studies/${caseStudy.id}`}
            className="tap-target flex flex-col gap-1 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
          >
            <span className="text-ink-1">{caseStudy.title}</span>
            <span className="flex flex-wrap gap-x-3 text-sm text-ink-2">
              <span>{STATUS_LABELS[caseStudy.status]}</span>
              <span>{`${Math.min(caseStudy.stepCount, 6)} of 6 steps`}</span>
              <span>{formatEdited(caseStudy.updatedAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
