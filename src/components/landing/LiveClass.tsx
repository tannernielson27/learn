import type { CSSProperties, ReactNode } from "react";
import { LIVE_CLASS_DEMO, type LiveClassDemo } from "./liveClassDemo";
import { PlayOnce } from "./PlayOnce";

/** The step a piece of the drawing plays at, for `[data-demo-step]` in globals.css. */
const step = (index: number) => ({ "--step": index }) as CSSProperties;

/**
 * The landing page's picture of a live session (#563), drawn in HTML and lines rather than shown
 * as a screenshot: the projector view with the question and a live answer count, and phones
 * answering it. It follows the QuestionStage, PhoneQuestion and PhoneSent mockups at small size.
 *
 * The projector stays light in both themes, as the real one does (`data-theme="light"`); the
 * phones follow the page's theme, as a student's phone follows its own. The phones repeat what the
 * projector says, so they are hidden from screen readers and the caption says what they show.
 *
 * It plays once when it scrolls into view (`PlayOnce`): a phone picks an answer, another sends
 * one, and the count settles from 15 to 18. Its HTML is the last frame.
 */
export function LiveClass({ demo = LIVE_CLASS_DEMO }: { demo?: LiveClassDemo }) {
  return (
    <figure aria-labelledby="live-class-caption" className="m-0">
      <PlayOnce>
        <Projector demo={demo} />
        {/* The phones stand in front of the screen's lower frame, never over the question or
            the count. */}
        <div
          aria-hidden="true"
          className="relative -mt-5 flex items-end justify-end gap-3 pr-3 sm:gap-4 sm:pr-6"
        >
          <Phone className="hidden sm:flex">
            <PhoneTop demo={demo} />
            <PhoneOptions demo={demo} />
            <p className="mt-auto text-center text-ink-2">Choose one answer.</p>
          </Phone>
          <Phone>
            <PhoneTop demo={demo} />
            <PhoneOptions demo={demo} picked={demo.chosen} />
            <span className="mt-auto rounded-sm bg-accent py-1.5 text-center font-semibold text-accent-contrast">
              Submit
            </span>
          </Phone>
          <Phone className="-translate-y-4">
            <PhoneTop demo={demo} />
            <div
              data-demo-step=""
              style={step(1)}
              className="flex items-center gap-2 rounded-sm bg-accent-soft p-2"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span className="font-semibold text-accent-ink">Answer sent</span>
            </div>
            <p className="text-ink-2">Your teacher has it. Wait for the answer to show.</p>
            <PhoneOptions demo={demo} picked={demo.sent} quiet />
          </Phone>
        </div>
      </PlayOnce>
      <figcaption
        id="live-class-caption"
        className="mt-4 max-w-prose border-t border-line pt-3 text-sm text-ink-2"
      >
        A live session as the class sees it: the question on the projector, a count of who has
        answered, never who, and the same question on every phone.
        <span className="sr-only">
          {" "}
          On the phones beside it, one student has chosen {demo.chosen}, one has sent {demo.sent},
          and one is still choosing.
        </span>
      </figcaption>
    </figure>
  );
}

/** The screen on the wall: a roller line above, the light stage inside a drawn frame. */
function Projector({ demo }: { demo: LiveClassDemo }) {
  return (
    <div>
      {/* The screen's roller: a line detail, slightly wider than the screen it holds. */}
      <div
        aria-hidden="true"
        className="-mx-2 h-2 rounded-t-sm border border-b-0 border-device-line"
      />
      <div className="border border-device-line p-1.5 pb-7 sm:p-2 sm:pb-8">
        <div
          data-theme="light"
          data-testid="live-class-projector"
          className="@container flex flex-col gap-[3cqi] bg-stage-surface px-[4.5cqi] py-[4cqi] text-stage-ink"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-demo-label font-semibold text-ink-2">
            <p className="tabular">{demo.place}</p>
            <p>
              Join at <span className="font-mono text-stage-ink">{demo.url}</span> ·{" "}
              <span className="font-mono font-bold tracking-[0.06em] whitespace-nowrap text-stage-ink">
                {demo.code}
              </span>
            </p>
          </div>
          <p className="max-w-[80cqi] text-demo-stem leading-tight font-semibold tracking-[-0.015em]">
            {demo.question.stem.value}
          </p>
          <ol aria-label="Choices" className="grid gap-[1.4cqi]">
            {demo.question.options.map((option) => (
              <li
                key={option.letter}
                className="flex items-center gap-[2cqi] rounded-sm border border-stage-line px-[2.2cqi] py-[1.1cqi] text-demo-option leading-snug font-medium"
              >
                <span
                  aria-hidden="true"
                  className="grid size-[1.9em] shrink-0 place-items-center rounded-full border border-stage-ink font-mono text-[0.85em] font-bold"
                >
                  {option.letter}
                </span>
                <span className="sr-only">{option.letter}. </span>
                <span className="min-w-0">{option.label}</span>
              </li>
            ))}
          </ol>
          <div className="flex items-end justify-between gap-4 border-t border-stage-line pt-[2cqi]">
            <p className="text-demo-label font-semibold text-ink-2">
              <span className="font-mono text-demo-number leading-none font-bold text-stage-ink tabular">
                {demo.clock}
              </span>{" "}
              left
            </p>
            <Count demo={demo} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "18 of 24 answered", as `AnswerCount` says it on the stage. The earlier number sits under the
 * final one in the same cell and gives way to it once; a screen reader hears only the final one.
 */
function Count({ demo }: { demo: LiveClassDemo }) {
  return (
    <p data-testid="live-class-count" className="flex items-baseline gap-x-2 text-demo-label">
      <span className="grid font-mono text-demo-number leading-none font-bold tabular">
        <span
          aria-hidden="true"
          data-demo-before=""
          style={step(2)}
          className="col-start-1 row-start-1"
        >
          {demo.answeredBefore}
        </span>
        <span data-demo-step="" style={step(2)} className="col-start-1 row-start-1">
          {demo.answered}
        </span>
      </span>{" "}
      <span className="font-semibold text-ink-2">
        of <span className="font-mono text-stage-ink tabular">{demo.present}</span> answered
      </span>
    </p>
  );
}

function Phone({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex w-36 flex-col rounded-device border border-device-line bg-surface-0 p-1.5 sm:w-40 lg:w-44 ${className}`.trim()}
    >
      <div className="flex h-60 flex-col gap-2 overflow-hidden rounded-[calc(var(--radius-device)-0.375rem)] border border-line bg-surface-1 px-2.5 pt-3 pb-2.5 text-demo-phone leading-snug text-ink-1 sm:h-64 lg:h-72">
        {children}
      </div>
    </div>
  );
}

function PhoneTop({ demo }: { demo: LiveClassDemo }) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-line pb-1.5">
        <span className="font-mono font-semibold tabular">{demo.place}</span>
        <span className="flex items-center gap-1 text-ink-2">
          <span className="size-1.5 rounded-full bg-ink-2" />
          Live
        </span>
      </div>
      <p className="line-clamp-3 font-medium">{demo.question.stem.value}</p>
    </>
  );
}

/** The options as a phone lists them; `picked` is the student's own choice, never a mark. */
function PhoneOptions({
  demo,
  picked,
  quiet = false,
}: {
  demo: LiveClassDemo;
  picked?: string;
  quiet?: boolean;
}) {
  return (
    <ul className={`flex flex-col gap-1 ${quiet ? "opacity-70" : ""}`.trim()}>
      {demo.question.options.map((option) => {
        const isPicked = option.letter === picked;
        return (
          <li
            key={option.letter}
            className="relative flex items-start gap-1.5 rounded-sm border border-line px-1.5 py-1"
          >
            {isPicked ? (
              <span
                data-demo-step={quiet ? undefined : ""}
                style={quiet ? undefined : step(0)}
                className="absolute -inset-px rounded-sm border-2 border-accent bg-accent-soft"
              />
            ) : null}
            <span className="relative font-mono font-bold">{option.letter}</span>
            <span className="relative line-clamp-1 min-w-0">{option.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
