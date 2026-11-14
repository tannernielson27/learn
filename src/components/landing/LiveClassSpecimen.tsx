import type { CSSProperties, ReactNode } from "react";
import { SPECIMEN } from "./specimen";
import { SpecimenMotion } from "./SpecimenMotion";

/** When a part arrives, in ms from the start, for `data-cue` (globals.css). */
const at = (ms: number) => ({ "--cue-at": `${ms}ms` }) as CSSProperties;

/** The four things a teacher should see, in the order the callouts number them. */
export const CALLOUTS = [
  {
    label: "Join code",
    text: `On the projector the whole time. Students type it at ${SPECIMEN.joinAt}, with no account.`,
  },
  {
    label: "Answer count",
    text: `How many have answered, never who: ${SPECIMEN.answered} of ${SPECIMEN.joined}. You decide when to reveal.`,
  },
  {
    label: "NCLEX layout",
    text: "Every phone shows the question in the exam's own layout, in every question format.",
  },
  {
    label: "Reveal",
    text: "Reveal the answer and each phone marks its own, with the rationale, scored like the exam.",
  },
] as const;

const number = (index: number) => String(index + 1).padStart(2, "0");

/**
 * A numbered callout on the specimen: a badge on the thing it names and, from 640px, a rule out to
 * a short mono label, like the labels on a diagram. It sits just outside what it names, never over it. Decoration: the legend under the specimen says
 * the same in words.
 */
function Callout({ index, side, start }: { index: number; side: "top" | "bottom"; start: number }) {
  const badge = (
    <span
      data-cue="fade"
      style={at(start)}
      className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-surface-1 bg-brand font-mono text-xs font-semibold text-surface-1 tabular"
    >
      {number(index)}
    </span>
  );
  const rule = (
    <span
      data-cue="draw-y"
      style={at(start + 120)}
      className={`hidden h-6 w-px bg-callout-line sm:block ${side === "top" ? "origin-bottom" : "origin-top"}`}
    />
  );
  const label = (
    <span
      data-cue="fade"
      style={at(start + 280)}
      className="hidden rounded-sm border border-brand bg-surface-1 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-[0.08em] whitespace-nowrap text-brand uppercase sm:inline-block"
    >
      {CALLOUTS[index]?.label}
    </span>
  );
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center font-ui ${
        side === "top"
          ? "bottom-[calc(100%+0.125rem)] flex-col-reverse"
          : "top-[calc(100%+0.125rem)] flex-col"
      }`}
    >
      {badge}
      {rule}
      {label}
    </span>
  );
}

/** The projector view in miniature: always light, sized in its own container units. */
function Projector() {
  const small = "text-[max(0.625rem,1.6cqi)]";
  const option = "text-[max(0.75rem,1.8cqi)]";
  const big = "text-[max(1.25rem,4.4cqi)]";
  return (
    <div
      data-theme="light"
      className="relative rounded-md border border-stage-line bg-stage-surface text-stage-ink [container-type:inline-size] sm:aspect-video"
    >
      <div className="flex h-full flex-col gap-[2cqi] px-[4.5cqi] py-[3.5cqi] max-sm:gap-3 max-sm:p-4">
        <div
          className={`flex flex-wrap items-baseline justify-between gap-x-[3cqi] gap-y-1 font-semibold text-ink-2 ${small}`}
        >
          <p>
            Question <span className="font-mono tabular">{SPECIMEN.at}</span> of{" "}
            <span className="font-mono tabular">{SPECIMEN.of}</span>
            {SPECIMEN.step ? ` · ${SPECIMEN.step}` : null}
          </p>
          <p>
            Join at <span className="font-mono text-stage-ink">{SPECIMEN.joinAt}</span> ·{" "}
            <span className="relative font-mono font-bold tracking-[0.06em] whitespace-nowrap text-stage-ink">
              {SPECIMEN.code}
              <Callout index={0} side="top" start={900} />
            </span>
          </p>
        </div>
        <p className="font-read text-[max(0.9375rem,2.7cqi)] leading-snug">{SPECIMEN.stem}</p>
        <ol className="flex flex-col gap-[1cqi] max-sm:gap-1.5">
          {SPECIMEN.choices.map((choice) => (
            <li
              key={choice.letter}
              className={`flex items-center gap-[1.4cqi] rounded-sm border border-stage-line px-[1.6cqi] py-[0.9cqi] max-sm:gap-2 max-sm:px-2 max-sm:py-1.5 ${option}`}
            >
              <span className="font-mono font-bold">{choice.letter}</span>
              <span>{choice.label}</span>
            </li>
          ))}
        </ol>
        <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-end gap-[5cqi] max-sm:gap-4">
          <div>
            <p className="flex items-baseline gap-[1cqi] max-sm:gap-1.5">
              <span className={`font-mono leading-none font-bold tabular ${big}`}>
                {SPECIMEN.timeLeft}
              </span>
              <span className={`font-semibold text-ink-2 ${option}`}>left</span>
            </p>
            <div className="mt-[1.2cqi] h-[max(4px,0.7cqi)] overflow-hidden rounded-sm bg-surface-2 max-sm:mt-2">
              <div
                className="h-full origin-left bg-stage-ink"
                style={{ transform: `scaleX(${SPECIMEN.timeShare})` }}
              />
            </div>
          </div>
          <p className="relative flex items-baseline gap-[1cqi] whitespace-nowrap max-sm:gap-1.5">
            <span
              data-cue="settle"
              style={at(700)}
              className={`inline-block font-mono leading-none font-bold tabular ${big}`}
            >
              {SPECIMEN.answered}
            </span>{" "}
            <span className={`font-semibold ${option}`}>
              of <span className="font-mono tabular">{SPECIMEN.joined}</span> answered
            </span>
            <Callout index={1} side="bottom" start={1200} />
          </p>
        </div>
      </div>
    </div>
  );
}

/** A student's phone in miniature, always light like the projector beside it. */
function Phone({
  children,
  start,
  className = "",
  callout,
}: {
  children: ReactNode;
  start: number;
  className?: string;
  callout?: ReactNode;
}) {
  return (
    <div
      data-cue="rise"
      style={at(start)}
      data-theme="light"
      className={`relative w-[calc((100%-0.75rem)/2)] max-w-(--specimen-phone) shrink-0 sm:w-40 md:w-(--specimen-phone) ${className}`}
    >
      <div className="flex aspect-[9/17] flex-col overflow-hidden rounded-md border-[5px] border-stage-ink bg-surface-1 text-ink-1 [container-type:inline-size]">
        <div className="flex flex-col gap-[3cqi] border-b border-line px-[6cqi] pt-[5cqi] pb-[4cqi]">
          <div className="flex items-center justify-between text-[max(0.5rem,5.5cqi)]">
            <span className="font-mono font-semibold tabular">
              Question {SPECIMEN.at} of {SPECIMEN.of}
            </span>
            <span className="flex items-center gap-[2cqi] text-ink-2">
              <span className="size-[max(4px,3cqi)] rounded-full bg-ink-2" />
              Live
            </span>
          </div>
          <div className="flex items-center gap-[3cqi]">
            <div className="h-[max(3px,2cqi)] flex-1 overflow-hidden rounded-sm bg-surface-2">
              <div
                className="h-full origin-left bg-ink-2"
                style={{ transform: `scaleX(${SPECIMEN.timeShare})` }}
              />
            </div>
            <span className="font-mono text-[max(0.5rem,5cqi)] text-ink-2 tabular">
              {SPECIMEN.timeLeft}
            </span>
          </div>
        </div>
        {children}
      </div>
      {callout}
    </div>
  );
}

/** The question in its NCLEX layout on a phone, with one choice picked and not yet sent. */
function Answering({ pick, start }: { pick: number; start: number }) {
  return (
    <>
      <div className="flex flex-1 flex-col gap-[4cqi] overflow-hidden px-[6cqi] py-[5cqi]">
        <p className="text-[max(0.5625rem,6cqi)] leading-snug">{SPECIMEN.stem}</p>
        <ul className="flex flex-col gap-[2.5cqi]">
          {SPECIMEN.choices.map((choice, index) => (
            <li
              key={choice.letter}
              className="relative flex items-start gap-[3cqi] rounded-sm border border-line px-[3.5cqi] py-[2.5cqi] text-[max(0.5rem,5.5cqi)] leading-tight"
            >
              {index === pick ? (
                // Picked: the selected treatment, faded in over the resting row.
                <span
                  data-cue="fade"
                  style={at(start)}
                  className="absolute -inset-px rounded-sm border-2 border-accent bg-accent-soft"
                />
              ) : null}
              <span className="relative font-mono font-bold">{choice.letter}</span>
              <span className="relative">{choice.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between gap-[3cqi] border-t border-line px-[6cqi] py-[4cqi]">
        <span className="text-[max(0.5rem,4.8cqi)] text-ink-2">Change it until you submit.</span>
        <span className="rounded-sm bg-accent px-[4cqi] py-[2cqi] text-[max(0.5rem,5.5cqi)] font-semibold text-accent-contrast">
          Submit
        </span>
      </div>
    </>
  );
}

/** The phone after Submit: Answer sent, waiting for the teacher to reveal. */
function Sent({ start }: { start: number }) {
  return (
    <div className="flex flex-1 flex-col gap-[4cqi] px-[6cqi] py-[6cqi]">
      <p className="text-[max(0.5625rem,6cqi)] leading-snug text-ink-2">{SPECIMEN.stem}</p>
      <div
        data-cue="rise"
        style={at(start)}
        className="mt-auto flex flex-col gap-[2cqi] rounded-sm border border-line bg-surface-2 px-[5cqi] py-[5cqi]"
      >
        <p className="flex items-center gap-[2.5cqi] text-[max(0.625rem,7cqi)] font-semibold">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[max(0.75rem,8cqi)] text-accent"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Answer sent
        </p>
        <p className="text-[max(0.5rem,5.5cqi)] text-ink-2">Wait for the answer to show.</p>
      </div>
    </div>
  );
}

/** What the picture shows, for a screen reader: the same facts as the callouts and legend. */
const DESCRIPTION =
  `A sample live session. The projector shows question ${SPECIMEN.at} of ${SPECIMEN.of}, ` +
  `a multiple choice question about a client with heart failure, the join code ${SPECIMEN.code}, ` +
  `${SPECIMEN.timeLeft} left and ${SPECIMEN.answered} of ${SPECIMEN.joined} answered. ` +
  "Beside it, students' phones show the same question in its NCLEX layout: one with a choice " +
  "picked, one with Answer sent, waiting for the answer to show.";

/**
 * The live session, annotated (#563): the projector view and students' phones answering one
 * question, drawn in HTML from fixture words (`specimen.ts`), with four numbered callouts and a
 * legend that says what each one is. Nothing here is a control.
 */
export function LiveClassSpecimen() {
  return (
    <figure className="overflow-hidden rounded-md border border-line bg-surface-1">
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2 font-mono text-xs tracking-[0.08em] text-ink-2 uppercase sm:px-5">
        <span>Fig. 1 · Live session</span>
        <span className="hidden tabular sm:inline">
          {SPECIMEN.joined} joined · Sample, fictional patient
        </span>
      </div>
      <SpecimenMotion className="grid-paper px-4 py-10 sm:px-8 sm:py-18 lg:px-10">
        <div
          role="img"
          aria-label={DESCRIPTION}
          className="grid items-center gap-x-10 gap-y-14 sm:gap-y-18 lg:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div data-cue="fade" style={at(0)}>
            <Projector />
          </div>
          <div className="flex items-start justify-center gap-3 sm:gap-4">
            <Phone
              start={250}
              callout={
                <span className="absolute inset-x-0 top-0">
                  <Callout index={2} side="top" start={1500} />
                </span>
              }
            >
              <Answering pick={SPECIMEN.picks[0]} start={650} />
            </Phone>
            <Phone
              start={400}
              className="mt-8"
              callout={
                <span className="absolute inset-x-0 bottom-0">
                  <Callout index={3} side="bottom" start={1800} />
                </span>
              }
            >
              <Sent start={900} />
            </Phone>
            <Phone start={550} className="mt-4 hidden sm:block lg:hidden">
              <Answering pick={SPECIMEN.picks[1]} start={800} />
            </Phone>
          </div>
        </div>
      </SpecimenMotion>
      <figcaption className="border-t border-line">
        <ol className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
          {CALLOUTS.map((callout, index) => (
            <li key={callout.label} className="flex gap-3 bg-surface-1 p-4 sm:p-5">
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full bg-brand font-mono text-xs font-semibold text-surface-1 tabular"
              >
                {number(index)}
              </span>
              <div>
                <p className="font-mono text-xs font-semibold tracking-[0.08em] text-brand uppercase">
                  {callout.label}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{callout.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
