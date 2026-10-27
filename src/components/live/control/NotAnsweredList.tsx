import { WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import type { RosterEntry } from "@/lib/live";

/** How many names the card lists before it says "and N more". */
export const NOT_ANSWERED_SHOWN = 8;

export interface NotAnsweredListProps {
  /** From `notAnswered`; null until the first read is back. */
  people: readonly RosterEntry[] | null;
}

/**
 * "Not answered yet" (QuestionControl mockup): who the teacher might wait for, with "Away"
 * beside a phone that has dropped, so a wait for someone whose screen went to sleep is a choice.
 * The control view only: the projector never shows who (owner decision 4).
 */
export function NotAnsweredList({ people }: NotAnsweredListProps) {
  const shown = people?.slice(0, NOT_ANSWERED_SHOWN) ?? [];
  const more = people === null ? 0 : people.length - shown.length;
  return (
    <section
      aria-labelledby="not-answered-heading"
      data-testid="not-answered-list"
      className="flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-surface-1"
    >
      <h2
        id="not-answered-heading"
        className="flex items-baseline gap-2 border-b border-line px-5 py-3.5 text-base font-semibold text-ink-1"
      >
        Not answered yet
        {people === null ? null : (
          <span className="font-mono font-medium text-ink-2 tabular">{people.length}</span>
        )}
      </h2>
      {people === null ? (
        <p className="px-5 py-3 text-sm text-ink-2">Checking who has answered.</p>
      ) : people.length === 0 ? (
        <p className="px-5 py-3 text-sm text-ink-2">Everyone has answered.</p>
      ) : (
        <ul className="min-h-0 overflow-y-auto">
          {shown.map((person) => (
            <li
              key={person.participantId}
              className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-5 last:border-b-0"
            >
              <span className="min-w-0 truncate">{person.displayName}</span>
              {person.present ? null : (
                <Badge className="shrink-0 font-medium">
                  <Icon icon={WifiOff} className="size-3.5" />
                  Away
                </Badge>
              )}
            </li>
          ))}
          {more > 0 ? (
            <li className="flex min-h-11 items-center px-5 text-ink-2">and {more} more</li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
