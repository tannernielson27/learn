import type { Ref } from "react";

interface AnswerSentLineProps {
  /** The visible words, owned by the room that shows them. */
  text: string;
  /**
   * What happens next, as a sentence under the words (PhoneSent mockup). With it the line becomes
   * a panel: `text` is its heading. Without it, one quiet line (StudentPacedRoom).
   */
  detail?: string;
  /** Announce the line to a screen reader as it appears (StudentRoom does; StudentPacedRoom does not). */
  announce?: boolean;
  /** The panel, for a room that moves focus onto it after Submit. Panel form (`detail`) only. */
  ref?: Ref<HTMLDivElement>;
}

function Check({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * The student's "Answer sent" line in a live session: a check and the words in accent ink, settling
 * in with `motion-arrive` (scale and fade, transform and opacity only). The icon has a fixed size from
 * the first frame, so nothing below it moves; reduced motion drops the animation and the line just
 * appears. Presentation only: the rooms decide when it shows.
 *
 * With a `detail` it is the PhoneSent mockup's panel instead: the check in an accent disc, a heading
 * and the next step under it, so a student glancing at the phone knows the answer is in.
 */
export function AnswerSentLine({ text, detail, announce = false, ref }: AnswerSentLineProps) {
  if (detail !== undefined) {
    return (
      <div
        ref={ref}
        tabIndex={ref ? -1 : undefined}
        role={announce ? "status" : undefined}
        data-testid="answer-sent"
        className="measure mb-5 rounded-md bg-accent-soft p-4"
      >
        <div
          data-motion="answer-sent"
          className="motion-arrive flex origin-left items-center gap-3.5 motion-reduce:animate-none"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast">
            <Check className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-accent-ink">{text}</p>
            <p className="text-sm text-ink-1">{detail}</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <p
      role={announce ? "status" : undefined}
      data-testid="answer-sent"
      className="measure mb-4 text-sm font-medium text-accent-ink"
    >
      <span
        data-motion="answer-sent"
        className="motion-arrive inline-flex origin-left items-center gap-2 motion-reduce:animate-none"
      >
        <Check className="size-5 shrink-0" />
        {text}
      </span>
    </p>
  );
}
