import type { StudentClass } from "@/lib/supabase/classInvites";
import { EmptyState } from "@/components/ui/EmptyState";

export interface StudentClassListProps {
  classes: readonly StudentClass[];
}

/**
 * A student's classes, by name, each with the workspace it belongs to: one account can be in
 * classes of more than one teacher's workspace, and two of them may share a name. The workspace
 * is left off when it is not known (a deploy running ahead of its migration). Their open
 * assignments are listed separately on /learn.
 */
export function StudentClassList({ classes }: StudentClassListProps) {
  if (classes.length === 0) {
    // Right under the student home's h1.
    return (
      <EmptyState
        level={2}
        heading="You are not in a class yet"
        body="Type your class code below, or open the invite link your instructor shares."
      />
    );
  }

  return (
    <ul
      aria-label="Your classes"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {classes.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5 px-2 py-3">
          <span className="font-medium break-words text-ink-1">{entry.name}</span>
          {entry.workspaceName ? (
            <span className="text-sm break-words text-ink-2">{entry.workspaceName}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
