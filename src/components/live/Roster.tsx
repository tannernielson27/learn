import { WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { countPresent, type RosterEntry } from "@/lib/live";

export interface RosterProps {
  roster: readonly RosterEntry[];
}

/**
 * Who is in the session, on the teacher's control view only: the projector shows names in the
 * lobby on its own, and counts after the start (owner decision 4).
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
    <section
      aria-labelledby="roster-heading"
      className="flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-surface-1"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-5 pb-3">
        <h2 id="roster-heading" className="font-read text-2xl text-ink-1">
          In this session
        </h2>
        <p data-testid="present-count" aria-live="polite" className="tabular text-sm text-ink-2">
          {/* Keyed on the number, so only this span remounts and settles in when it changes: one
              CSS animation however many join, no JS loop, and the rows below keep their mounts. */}
          <span
            key={present}
            data-motion="present-count"
            className="motion-settle inline-block font-mono font-bold text-ink-1 motion-reduce:animate-none"
          >
            {present}
          </span>{" "}
          {present === 1 ? "phone" : "phones"} connected
        </p>
      </div>

      {roster.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-sm text-ink-2">Nobody has joined yet.</p>
      ) : (
        <ul className="min-h-0 overflow-y-auto border-t border-line">
          {roster.map((entry) => (
            <li
              key={entry.participantId}
              className={`motion-enter flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-2 last:border-b-0 ${
                entry.present ? "text-ink-1" : "text-ink-2"
              }`}
            >
              <span className="min-w-0 truncate">{entry.displayName}</span>
              {entry.present ? null : (
                <Badge className="shrink-0 font-medium">
                  <Icon icon={WifiOff} className="size-3.5" />
                  Away
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
