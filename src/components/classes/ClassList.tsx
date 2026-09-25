import Link from "next/link";
import { classPath } from "@/lib/classes/classes";
import type { ClassSummary } from "@/lib/supabase/classes";
import { EmptyState, type EmptyStateAction } from "@/components/ui/EmptyState";

export interface ClassListProps {
  classes: readonly ClassSummary[];
  /** With no classes yet: where one is made, on the page that lists them. */
  emptyAction?: EmptyStateAction;
}

function studentCount(count: number): string {
  return count === 1 ? "1 student" : `${count} students`;
}

export function ClassList({ classes, emptyAction }: ClassListProps) {
  if (classes.length === 0) {
    // Right under the Classes page's h1.
    return (
      <EmptyState
        level={2}
        heading="No classes yet"
        body="Create one to get an invite link for your students."
        action={emptyAction}
      />
    );
  }

  return (
    <ul aria-label="Classes" className="flex flex-col divide-y divide-line border-y border-line">
      {classes.map((entry) => (
        <li key={entry.id}>
          <Link
            href={classPath(entry.id)}
            className="tap-target flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
          >
            <span className="font-medium text-ink-1">{entry.name}</span>
            <span className="text-sm text-ink-2">{studentCount(entry.memberCount)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
