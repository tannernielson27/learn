import { Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

export interface QuizSidePanelProps {
  newQuestionHref: string;
  /** The New case study form (`CreateCaseStudyForm`), named and created right here. */
  newCaseStudy: ReactNode;
  /** Import with AI, only where AI import is on for the deployment and the workspace (#345). */
  aiImportHref?: string;
  /** The folders inside the quiz, for a quiz that still has some (#411). */
  folders?: ReactNode;
  /** Rename quiz, behind More. */
  more: ReactNode;
}

const ADD_CLASSES = `${buttonClasses({ block: true })} justify-start`;

/**
 * The quiz page's side column (Quiz mockup): what can be added to the quiz, the folders inside it
 * where it has any, and the rarer changes behind More. Beside the list from 1024px, under it below.
 *
 * The mockup's Last live session card is left out: nothing on this page reads live sessions, and
 * it would be one more read on every visit.
 */
export function QuizSidePanel({
  newQuestionHref,
  newCaseStudy,
  aiImportHref,
  folders,
  more,
}: QuizSidePanelProps) {
  return (
    <aside aria-label="Quiz tools" className="flex min-w-0 flex-col gap-4">
      <Card padding="sm" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink-1">Add to this quiz</h2>
        <Link href={newQuestionHref} className={ADD_CLASSES}>
          <Icon icon={Plus} />
          New question
        </Link>
        {aiImportHref ? (
          <Link href={aiImportHref} className={ADD_CLASSES}>
            <Icon icon={Sparkles} />
            Import with AI
          </Link>
        ) : null}
        <div className="border-t border-line pt-3">{newCaseStudy}</div>
      </Card>
      {folders}
      <Card padding="none" className="px-3">
        <details>
          <summary className="tap-target flex cursor-pointer items-center text-sm font-semibold text-ink-1">
            More
          </summary>
          <div className="flex flex-col gap-3 pb-3">{more}</div>
        </details>
      </Card>
    </aside>
  );
}
