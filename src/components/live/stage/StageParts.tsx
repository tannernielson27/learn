import type { ReactNode } from "react";
import { RichTextView } from "@/components/question/QuestionShell";
import { formatSessionCode } from "@/lib/live/sessionCode";
import type { RichText } from "@/lib/ngn/schemas";
import type { StageOption } from "./stageItem";

/**
 * The small pieces every projector screen is built from, in the stage type ladder
 * (`text-stage-*`, PLAN §6): sizes in the stage's container units with rem floors, so a 720p
 * projector and a 1080p one read the same from the back row.
 */

/** The strip across the top: where the room is on the left, a second fact on the right. */
export function StageStrip({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-[3cqb] gap-y-[1cqb] text-stage-label font-semibold text-ink-2">
      <p className="min-w-0">{left}</p>
      {right === undefined ? null : <p className="min-w-0">{right}</p>}
    </header>
  );
}

/**
 * A small join strip, so a late student can still get in after the start (PLAN §5.2). The code
 * stays mono with a gap between its halves, as on the lobby screen.
 */
export function JoinStrip({ url, code }: { url: string; code: string }) {
  return (
    <span data-testid="stage-join-strip">
      Join at <span className="font-mono text-stage-ink">{url}</span> ·{" "}
      <span className="font-mono font-bold tracking-[0.06em] text-stage-ink">
        {formatSessionCode(code)}
      </span>
    </span>
  );
}

/**
 * The question text, the stage's largest words after the join code. A step down on a short
 * projector (1280x720), where the rem floor would otherwise push the options off the wall.
 */
export function StageStem({ stem, small = false }: { stem: RichText; small?: boolean }) {
  return (
    <div
      className={`max-w-[80cqi] leading-tight font-semibold tracking-[-0.015em] text-stage-ink ${small ? "text-stage-option" : "text-stage-stem [@container(max-height:50rem)]:text-stage-option"} [&_p+p]:mt-[1cqb]`}
    >
      <RichTextView text={stem} />
    </div>
  );
}

/**
 * The options, lettered as every phone letters them, with no mark of any kind: this list is
 * drawn while answers are still coming in. Two columns past four options, so a long set fits.
 */
export function StageOptions({ options }: { options: readonly StageOption[] }) {
  const columns = options.length > 4 ? "grid-cols-2" : "grid-cols-1";
  return (
    <ol aria-label="Choices" className={`grid ${columns} gap-[1.5cqb]`}>
      {options.map((option) => (
        <li
          key={option.letter}
          className="flex items-center gap-[2.5cqb] rounded-md border-(length:--stage-stroke) border-stage-line px-[3cqb] py-[1.3cqb] text-stage-option leading-tight font-medium"
        >
          <span
            aria-hidden="true"
            className="grid size-[6.5cqb] shrink-0 place-items-center rounded-full border-(length:--stage-stroke) border-stage-ink font-mono font-bold"
          >
            {option.letter}
          </span>
          <span className="sr-only">{option.letter}. </span>
          <span className="min-w-0">{option.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** A big mono number with its words beside it: "24 in this session". */
export function StageNumber({ value, words }: { value: ReactNode; words: ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-[1.5cqb]">
      <span className="font-mono text-stage-number leading-none font-bold tabular">{value}</span>
      <span className="text-stage-option font-semibold">{words}</span>
    </p>
  );
}
