import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { BackLinkMark, backLinkClasses } from "@/components/ui/BackLink";
import { PAGE_TITLE_CLASSES } from "@/components/ui/PageHeader";
import { textLinkClasses } from "@/components/ui/TextLink";
import { sentenceCase } from "@/lib/authoring/format";
import { GuardedLink } from "./LeaveGuard";

const STATUS_LABELS = { draft: "Draft", published: "Published", archived: "Archived" } as const;

export interface ItemPageHeaderProps {
  /** The quiz the question is in: Back to quiz. */
  bankHref: string;
  /** Export JSON, for a valid saved question only (docs/transfer-format.md). */
  exportHref?: string;
  /** The type's name as the catalogue spells it ("Multiple Choice"); shown in sentence case. */
  typeLabel: string;
  status: keyof typeof STATUS_LABELS;
  /** Restore and Duplicate for an archived question, which has no editor to hold them. */
  archivedActions?: ReactNode;
}

/**
 * The question page's head (#563): the guarded way back, Export JSON, the title in the page title
 * style, and one metadata line with the type in sentence case and the status. The type is a plain
 * label (docs/04 §11, 2026-11-14), not the tracked capitals of the public site's eyebrows. Save
 * draft, Publish and More are the editor's own bar, under this.
 */
export function ItemPageHeader({
  bankHref,
  exportHref,
  typeLabel,
  status,
  archivedActions,
}: ItemPageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-6">
        <GuardedLink href={bankHref} className={backLinkClasses()}>
          <BackLinkMark />
          <span>Back to quiz</span>
        </GuardedLink>
        {exportHref ? (
          <a href={exportHref} download className={textLinkClasses({ size: "sm" })}>
            Export JSON
          </a>
        ) : null}
      </div>
      <h1 className={PAGE_TITLE_CLASSES}>Edit question</h1>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-2">
        <span>{sentenceCase(typeLabel)}</span>
        <Badge tone={status === "draft" ? "accent" : "neutral"}>{STATUS_LABELS[status]}</Badge>
      </p>
      {archivedActions ? (
        <div className="mt-2 flex flex-wrap items-start gap-2">{archivedActions}</div>
      ) : null}
    </header>
  );
}
