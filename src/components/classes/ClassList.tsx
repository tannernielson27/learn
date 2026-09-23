import Link from "next/link";
import { classPath } from "@/lib/classes/classes";
import type { ClassSummary } from "@/lib/supabase/classes";

export interface ClassListProps {
  classes: readonly ClassSummary[];
}

function studentCount(count: number): string {
  return count === 1 ? "1 student" : `${count} students`;
}

export function ClassList({ classes }: ClassListProps) {
  if (classes.length === 0) {
    return <p className="text-ink-2">No classes yet. Create one to get an invite link.</p>;
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
