import type { RosterEntry } from "@/lib/supabase/classes";
import { ConfirmSubmit, type ConfirmSubmitProps } from "./ConfirmSubmit";
import { EmptyState, type EmptyStateAction } from "@/components/ui/EmptyState";

export interface ClassRosterProps {
  entries: readonly RosterEntry[];
  /** The remove Server Function bound to one student. */
  removeActionFor: (profileId: string) => ConfirmSubmitProps["action"];
  /** With nobody on it yet: where the invite link is, on the class page. */
  emptyAction?: EmptyStateAction;
}

/** Who has joined a class, and a way to take someone off it. */
export function ClassRoster({ entries, removeActionFor, emptyAction }: ClassRosterProps) {
  if (entries.length === 0) {
    // Under the class page's Roster h2.
    return (
      <EmptyState
        level={3}
        heading="Nobody has joined yet"
        body="Share the invite link with your class."
        action={emptyAction}
      />
    );
  }

  return (
    <ul aria-label="Roster" className="flex flex-col divide-y divide-line border-y border-line">
      {entries.map((entry) => (
        <li
          key={entry.profileId}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2 py-3"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-ink-1">{entry.displayName ?? entry.email}</span>
            {entry.displayName ? (
              <span className="truncate text-sm text-ink-2">{entry.email}</span>
            ) : null}
            {entry.signedIn ? null : (
              <span className="text-sm text-ink-2">Has not signed in yet</span>
            )}
          </span>
          <ConfirmSubmit
            action={removeActionFor(entry.profileId)}
            label="Remove"
            ariaLabel={`Remove ${entry.email}`}
            confirmLabel="Remove from class"
            warning="They lose this class. Their account is kept."
          />
        </li>
      ))}
    </ul>
  );
}
