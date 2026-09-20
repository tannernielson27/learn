import { countPresent, type RosterEntry } from "@/lib/live";

export interface RosterProps {
  roster: readonly RosterEntry[];
}

/**
 * Who is in the room, on the screen at the front of it.
 *
 * Names and nothing else — no scores, no "answered", no join time. The count beside the heading is
 * a polite live region, so a host running the class with a screen reader hears the room fill up
 * without having to go looking for it, and the names themselves are not announced one by one,
 * which in a class of sixty would be unusable.
 *
 * A phone that has gone quiet greys out and stays listed. That is said in a word — "Away" — and
 * not only in colour: a locked phone is not an error, and a name vanishing off the front of the
 * class reads as "they left" when what happened is that a screen went to sleep.
 */
export function Roster({ roster }: RosterProps) {
  const present = countPresent(roster);

  return (
    <section aria-labelledby="roster-heading" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="roster-heading" className="font-read text-xl text-ink-1">
          In the room
        </h2>
        <p data-testid="present-count" aria-live="polite" className="tabular text-sm text-ink-2">
          {present} {present === 1 ? "phone" : "phones"} connected
        </p>
      </div>

      {roster.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">
          Nobody has joined yet. Read the code out, or leave the QR code on the screen.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-px overflow-hidden rounded-sm border border-line">
          {roster.map((entry) => (
            <li
              key={entry.participantId}
              className={`motion-enter flex min-h-11 items-center justify-between gap-3 bg-surface-1 px-3 py-2 ${
                entry.present ? "text-ink-1" : "text-ink-2"
              }`}
            >
              <span className="min-w-0 truncate">{entry.displayName}</span>
              {entry.present ? null : (
                <span className="shrink-0 rounded-sm border border-line px-2 py-0.5 text-xs text-ink-2">
                  Away
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
