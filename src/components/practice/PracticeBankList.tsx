import { workspaceLabel } from "@/lib/classes/studentClasses";
import { practicePath, practiceProgressLabel } from "@/lib/practice/paths";
import type { PracticeBank } from "@/lib/supabase/practice";
import { HOME_LIST_CLASSES, HomeRow } from "@/components/learn/HomeRow";
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
    <ul aria-label="Practice quizzes" className={HOME_LIST_CLASSES}>
      {banks.map((bank) => {
        const workspace = workspaceLabel(bank.workspaceName, showWorkspace);
        return (
          <HomeRow key={bank.bankId} href={practicePath(bank.bankId)} title={bank.name}>
            <span className="tabular">
              {workspace ? (
                <>
                  <span>{workspace}</span> ·{" "}
                </>
              ) : null}
              {practiceProgressLabel(bank)}
            </span>
          </HomeRow>
        );
      })}
    </ul>
  );
}
