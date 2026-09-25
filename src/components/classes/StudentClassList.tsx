import type { StudentClass } from "@/lib/supabase/classInvites";
import { EmptyState } from "@/components/ui/EmptyState";

export interface StudentClassListProps {
  classes: readonly StudentClass[];
}

/** A student's classes, by name. Their open assignments are listed separately on /learn. */
export function StudentClassList({ classes }: StudentClassListProps) {
  if (classes.length === 0) {
    // Right under the student home's h1.
    return (
      <EmptyState
        level={2}
        heading="You are not in a class yet"
        body="Open the invite link your instructor shares to join one."
      />
    );
  }

  return (
    <ul
      aria-label="Your classes"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {classes.map((entry) => (
        <li key={entry.id} className="px-2 py-3 font-medium text-ink-1">
          {entry.name}
        </li>
      ))}
    </ul>
  );
}
