import type { StudentClass } from "@/lib/supabase/classInvites";

export interface StudentClassListProps {
  classes: readonly StudentClass[];
}

/** A student's classes, by name. Assignments join each one from #207. */
export function StudentClassList({ classes }: StudentClassListProps) {
  if (classes.length === 0) {
    return (
      <p className="text-ink-2">
        You are not in a class yet. Open the invite link your instructor shares to join one.
      </p>
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
