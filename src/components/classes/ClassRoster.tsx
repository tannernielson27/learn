import type { RosterEntry } from "@/lib/supabase/classes";
import { ConfirmSubmit } from "./ConfirmSubmit";

export interface ClassRosterProps {
  entries: readonly RosterEntry[];
  /** The remove Server Function bound to one student. */
  removeActionFor: (profileId: string) => (formData: FormData) => Promise<void>;
}

/** Who has joined a class, and a way to take someone off it. */
export function ClassRoster({ entries, removeActionFor }: ClassRosterProps) {
  if (entries.length === 0) {
    return (
      <p className="text-ink-2">Nobody has joined yet. Share the invite link with your class.</p>
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
