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

/**
 * The strip across the top: where the room is on the left, a second fact on the right.
 *
 * `qr` is the join URL's QR code (`SessionQrCode`, drawn on the server), set just before the
 * right-hand words. It is about two lines of the strip tall (`--stage-join-qr`), for the front
 * rows, but takes one line's height in the layout and spills evenly above and below it into the
 * gaps around the strip, so its height never moves the question down. Its width can: a strip that
 * only just fit on one line takes two. It is a flex item of its own so that then it stays up
 * beside the place and the words take the next line whole, rather than being broken around it.
 */
export function StageStrip({
  left,
  right,
  qr,
}: {
  left: ReactNode;
  right?: ReactNode;
  qr?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-[3cqb] gap-y-[1cqb] text-stage-label font-semibold text-ink-2">
      <p className="min-w-0">{left}</p>
      {qr == null ? null : (
        <span
          data-testid="stage-join-qr"
          className="relative ml-auto h-[1lh] w-(--stage-join-qr) shrink-0 self-center [&>svg]:absolute [&>svg]:top-1/2 [&>svg]:left-0 [&>svg]:size-(--stage-join-qr) [&>svg]:-translate-y-1/2"
        >
          {qr}
        </span>
      )}
      {right === undefined ? null : <p className="min-w-0">{right}</p>}
    </div>
  );
}

/**
 * A small join strip, so a late student can still get in after the start (PLAN §5.2). The code
 * stays mono with a gap between its halves, as on the lobby screen. Its QR code, when there is
 * one, sits just before it (`StageStrip`'s `qr`).
 */
export function JoinStrip({ url, code }: { url: string; code: string }) {
  return (
    <span data-testid="stage-join-strip">
      Join at <span className="font-mono text-stage-ink">{url}</span> ·{" "}
      {/* Never split across lines: half a code on each is no code at all. */}
      <span className="font-mono font-bold tracking-[0.06em] whitespace-nowrap text-stage-ink">
        {formatSessionCode(code)}
      </span>
    </span>
  );
}

/**
 * The question text, the stage's largest words after the join code. A step down on a short
 * projector (1280x720), where the rem floor would otherwise push the options off the wall.
 *
 * `clamp` is for a crowded question (`crowded`): a step down at every size and three lines at
 * most, so the options keep the room (the whole text is on every phone). On the question stage a
 * stem longer than that is fitted or scrolled instead (`StageStemFit`), and the clamp lifts.
 */
export function StageStem({
  stem,
  small = false,
  clamp = false,
}: {
  stem: RichText;
  small?: boolean;
  clamp?: boolean;
}) {
  const size =
    small || clamp
      ? "text-stage-option"
      : "text-stage-stem [@container(max-height:50rem)]:text-stage-option";
  return (
    <div
      data-stage-stem=""
      className={`max-w-[80cqi] leading-tight font-semibold tracking-[-0.015em] text-stage-ink ${size} ${clamp ? "line-clamp-3 shrink-0 in-data-[stem-long]:line-clamp-none" : ""} [&_p+p]:mt-[1cqb]`}
    >
      <RichTextView text={stem} />
    </div>
  );
}

/**
 * The options as every phone draws them, with no mark of any kind: this list is drawn while
 * answers are still coming in. Lettered for multiple choice; a select-all question's rows have no
 * letter, as on its phones. Two columns past four options, so a long set fits.
 *
 * The list takes the height left under the stem and its rows share it (`minmax(0, max-content)`):
 * with room to spare each row is as tall as its words, and on a short wall every row shrinks
 * alike and clips inside itself, so no option row is ever pushed off the stage. A crowded
 * question's rows are tighter and their words stop at two lines. Under a stem too long for its
 * three lines (`StageStemFit`) the list is only as tall as its rows, and the stem takes the rest.
 */
export function StageOptions({
  options,
  compact = false,
}: {
  options: readonly StageOption[];
  /** A crowded question (`crowded`): tighter rows, each option's words to two lines. */
  compact?: boolean;
}) {
  const columns = options.length > 4 ? "grid-cols-2" : "grid-cols-1";
  return (
    <ol
      aria-label="Choices"
      className={`grid min-h-0 flex-1 auto-rows-[minmax(0,max-content)] content-start ${columns} gap-[1.5cqb] in-data-[stem-long]:flex-[0_1_auto]`}
    >
      {options.map((option, index) => (
        <li
          key={option.letter ?? index}
          className={`flex min-h-0 items-center gap-[2.5cqb] overflow-hidden rounded-md border-(length:--stage-stroke) border-stage-line px-[3cqb] text-stage-option leading-tight font-medium ${compact ? "py-[0.8cqb]" : "py-[1.3cqb]"}`}
        >
          {option.letter === null ? null : (
            <>
              <span
                aria-hidden="true"
                className="grid size-[6.5cqb] shrink-0 place-items-center rounded-full border-(length:--stage-stroke) border-stage-ink font-mono font-bold"
              >
                {option.letter}
              </span>
              <span className="sr-only">{option.letter}. </span>
            </>
          )}
          {/* A crowded question's words stop at two lines on the wall; each phone has them whole. */}
          <span className={`min-w-0 ${compact ? "line-clamp-2" : ""}`}>{option.label}</span>
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
