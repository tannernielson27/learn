import Link from "next/link";
import { workspaceLabel } from "@/lib/classes/studentClasses";
import { practicePath, practiceProgressLabel } from "@/lib/practice/paths";
import type { PracticeBank } from "@/lib/supabase/practice";
import { EmptyState } from "@/components/ui/EmptyState";

export interface PracticeBankListProps {
  banks: readonly PracticeBank[];
  /** Whether the student's classes span more than one workspace: `spansWorkspaces`. */
  showWorkspace?: boolean;
}

/**
 * The Practice section of the student home (#241): each quiz a teacher has shared with one of
 * the student's classes, how many questions it holds, and how far the student has got. Each name
 * opens the quiz for practice. For a student in more than one workspace each row also names the
 * quiz's workspace, as the assignment and history rows do. A Server Component.
 */
export function PracticeBankList({ banks, showWorkspace = false }: PracticeBankListProps) {
  if (banks.length === 0) {
    // Under the student home's Practice h2.
    return <EmptyState level={3} heading="Nothing shared for practice yet" />;
  }
  return (
    <ul
      aria-label="Practice quizzes"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {banks.map((bank) => {
        const workspace = workspaceLabel(bank.workspaceName, showWorkspace);
        return (
          <li key={bank.bankId} className="flex flex-col gap-1 px-2 py-3">
            <Link
              href={practicePath(bank.bankId)}
              className="tap-target inline-flex items-center font-medium break-words text-ink-1 underline decoration-line-strong underline-offset-4 hover:decoration-accent"
            >
              {bank.name}
            </Link>
            <span className="tabular text-sm break-words text-ink-2">
              {workspace ? `${workspace} · ` : null}
              {practiceProgressLabel(bank)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
