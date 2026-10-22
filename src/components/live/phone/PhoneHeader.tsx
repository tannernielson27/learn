import { Countdown } from "@/components/live/Countdown";
import { Badge } from "@/components/ui/Badge";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import type { ItemTimer } from "@/lib/live/timer";
import type { LiveConnection } from "@/lib/live/transport";

export interface PhoneHeaderProps {
  /** "Question 3 of 20", or null between questions, when the title stands in its place. */
  progress: string | null;
  title: string;
  connection: LiveConnection;
  /** The question's clock, when it has one and belongs on screen. */
  timer?: ItemTimer | null;
  serverNow: () => number;
  /** A badge in place of the connection, such as "Answer showing". */
  badge?: string;
}

/**
 * The top of a student's phone (PhoneQuestion mockup): where the session is, whether the phone
 * can hear it, and the question's clock with "10 seconds left" in words at the end. On a phone on
 * its side (height under 480px) it collapses to one slim line, so the question keeps the screen
 * (PhoneQuestionLand mockup, PLAN §6).
 *
 * The page's one `h1` is the session's title, here, so every state has the same heading.
 */
export function PhoneHeader({
  progress,
  title,
  connection,
  timer,
  serverNow,
  badge,
}: PhoneHeaderProps) {
  return (
    <header className="sticky top-0 z-1 -mx-4 flex flex-col gap-2.5 border-b border-line bg-surface-1 px-5 pt-3.5 pb-3 [@media(max-height:479px)]:flex-row [@media(max-height:479px)]:items-center [@media(max-height:479px)]:gap-4 [@media(max-height:479px)]:py-1.5">
      <div className="flex min-w-0 items-center justify-between gap-3 text-sm [@media(max-height:479px)]:contents">
        <div className="min-w-0">
          <h1 className={progress === null ? "truncate font-semibold text-ink-1" : "sr-only"}>
            {title}
          </h1>
          {progress === null ? null : (
            <p className="font-mono font-semibold whitespace-nowrap text-ink-1 tabular">
              {progress}
            </p>
          )}
        </div>
        {badge === undefined ? (
          <ConnectionStatus
            status={connection}
            className="shrink-0 [@media(max-height:479px)]:order-last"
          />
        ) : (
          <Badge className="shrink-0">{badge}</Badge>
        )}
      </div>
      {timer ? (
        <Countdown timer={timer} now={serverNow} className="[@media(max-height:479px)]:flex-1" />
      ) : null}
    </header>
  );
}
