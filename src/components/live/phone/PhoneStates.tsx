import Link from "next/link";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { RoomCount, type PresentCount } from "@/components/live/RoomCount";
import { buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";
import { JOIN_PATH } from "@/lib/live/routes";
import { endTally, worthWords, type PhoneHistory, type SeenItem } from "./history";

/**
 * The phone's named states between questions (PLAN §5.6, Socrative's model): one sentence each
 * and at most one action. Each is a full-height column with the sentence as its heading, so a
 * student glancing down from the front of the room reads it at once.
 */

/** One state: an optional mark, a heading, a line under it and at most one action. */
export function PhoneMessage({
  heading,
  eyebrow,
  children,
  action,
  mark,
  testId,
}: {
  heading: string;
  eyebrow?: string | null;
  children?: ReactNode;
  action?: ReactNode;
  mark?: ReactNode;
  testId?: string;
}) {
  return (
    <section
      aria-labelledby="phone-state-heading"
      className="flex flex-1 flex-col justify-center gap-5 py-10"
    >
      {mark}
      {eyebrow ? <p className="eyebrow tabular">{eyebrow}</p> : null}
      <h2
        id="phone-state-heading"
        data-testid={testId}
        className="font-read text-3xl leading-tight text-ink-1"
      >
        {heading}
      </h2>
      {children}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}

/** "You are in." (PhoneWaiting mockup): who this phone joined as, and how many are in. */
export function PhoneWaiting({
  headline,
  displayName,
  present,
}: {
  headline: string;
  displayName: string;
  present: PresentCount;
}) {
  return (
    <PhoneMessage
      heading={headline}
      mark={
        <span className="grid size-14 place-items-center rounded-full bg-correct-soft text-correct">
          <Icon icon={Check} />
        </span>
      }
    >
      {/* One element holds both, so "Joined as" is read with the name it introduces. */}
      <p className="rounded-md border border-line bg-surface-1 p-4 text-sm text-ink-2">
        Joined as{" "}
        <span className="mt-1 block text-lg font-semibold break-words text-ink-1">
          {displayName}
        </span>
      </p>
      <RoomCount present={present} />
      <p className="text-sm text-ink-2">
        Stay on this page. If your phone sleeps, it reconnects on its own.
      </p>
    </PhoneMessage>
  );
}

/**
 * The server will not let this phone back in: it was removed, its session closed, or the student
 * joined again on another device.
 */
export function PhoneRefused() {
  return (
    <PhoneMessage
      heading="You are no longer in this live session."
      action={
        <Link href={JOIN_PATH} className={buttonClasses({ variant: "secondary", block: true })}>
          Join a live session
        </Link>
      }
    >
      <p className="text-ink-2">Your teacher has the answers you sent.</p>
      {/* A signed-in student who joins again on another device takes their place with them
          (ADR 0013), and this phone cannot tell that from being removed, so it says both. */}
      <p className="text-ink-2">
        If you joined this live session on another device, carry on there.
      </p>
    </PhoneMessage>
  );
}

function stepName(entry: SeenItem): string | null {
  return entry.cjmmStep !== null && entry.cjmmStep in CJMM_STEP_LABELS
    ? CJMM_STEP_LABELS[entry.cjmmStep as CjmmStep]
    : null;
}

/**
 * The end of the session on a phone (PhoneEnded mockup, PLAN §5.11): how this phone did, and
 * which questions are worth another look, from nothing but what it was sent. No promise of a
 * results page: a student in a live session may have no account.
 */
export function PhoneEnded({
  headline,
  history,
  itemCount,
}: {
  headline: string;
  history: PhoneHistory;
  itemCount: number;
}) {
  const tally = endTally(history);
  return (
    <PhoneMessage
      eyebrow="Live session ended"
      heading={headline}
      action={
        <Link
          href={JOIN_PATH}
          className={buttonClasses({ variant: "secondary", size: "lg", block: true })}
        >
          Join another live session
        </Link>
      }
    >
      {history.length === 0 ? null : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            <div className="flex flex-col-reverse rounded-md border border-line bg-surface-1 p-4">
              <dt className="mt-1 text-sm text-ink-2">answered</dt>
              <dd className="font-mono text-3xl font-bold tabular">
                {tally.answered}
                <span className="text-lg font-medium text-ink-2">/{itemCount}</span>
              </dd>
            </div>
            {tally.marked === 0 ? null : (
              <div className="flex flex-col-reverse rounded-md border border-line bg-surface-1 p-4">
                <dt className="mt-1 text-sm text-ink-2">all correct</dt>
                <dd className="font-mono text-3xl font-bold tabular">
                  {tally.allCorrect}
                  <span className="text-lg font-medium text-ink-2">/{tally.marked}</span>
                </dd>
              </div>
            )}
          </dl>
          {tally.worthALook.length === 0 ? null : (
            <section aria-labelledby="worth-heading" className="flex flex-col gap-2.5">
              <h3 id="worth-heading" className="font-bold text-ink-1">
                Worth another look
              </h3>
              <ul className="overflow-hidden rounded-md border border-line bg-surface-1">
                {tally.worthALook.map((entry) => (
                  <li
                    key={entry.position}
                    className="flex justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                  >
                    <span>
                      Question {entry.position}
                      {stepName(entry) === null ? null : <> · {stepName(entry)}</>}
                    </span>
                    <span className="font-mono text-sm font-semibold whitespace-nowrap text-ink-2">
                      {worthWords(entry)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <Notice>Your teacher has the full report.</Notice>
    </PhoneMessage>
  );
}
