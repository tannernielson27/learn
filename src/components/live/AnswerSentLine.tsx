interface AnswerSentLineProps {
  /** The visible words, owned by the room that shows them. */
  text: string;
  /** Announce the line to a screen reader as it appears (StudentRoom does; StudentPacedRoom does not). */
  announce?: boolean;
}

/**
 * The student's "Answer sent" line in a live session: a check and the words in accent ink, settling
 * in with `motion-arrive` (scale and fade, transform and opacity only). The icon has a fixed size from
 * the first frame, so nothing below it moves; reduced motion drops the animation and the line just
 * appears. Presentation only: the rooms decide when it shows.
 */
export function AnswerSentLine({ text, announce = false }: AnswerSentLineProps) {
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
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 shrink-0"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {text}
      </span>
    </p>
  );
}
