import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import type { StageOption } from "@/components/live/stage/stageItem";
import { AnswerCount } from "@/components/ui/AnswerCount";
import { Icon } from "@/components/ui/Icon";
import { formatSessionCode } from "@/lib/live/sessionCode";
import { LIVE_DEMO, type LiveDemo } from "./liveDemo";
import { PlayOnce } from "./PlayOnce";

/** The step a `.demo-*` element waits for (globals.css): 160ms each. */
const step = (n: number) => ({ "--demo-step": n }) as CSSProperties;

/**
 * The projector, drawn small: always light, in both themes (docs/04 §1), as the QuestionStage
 * mockup lays it out. The strip, the question and its lettered options, the clock and the count.
 * No marks of any kind: this is the screen while answers are still coming in.
 */
function Projector({ demo }: { demo: LiveDemo }) {
  return (
    <div
      data-theme="light"
      data-testid="demo-projector"
      className="rounded-md border border-stage-line bg-stage-surface px-[4cqi] pt-[3.5cqi] pb-[13cqi] text-stage-ink"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-[3cqi] text-demo-label font-semibold text-ink-2">
        <p>{demo.place}</p>
        <p>
          Join at <span className="font-mono text-stage-ink">{demo.url}</span> ·{" "}
          <span className="font-mono font-bold tracking-[0.06em] whitespace-nowrap text-stage-ink">
            {formatSessionCode(demo.code)}
          </span>
        </p>
      </div>
      <p className="mt-[3cqi] max-w-[88%] text-demo-stem leading-tight font-semibold tracking-[-0.015em]">
        {demo.stem}
      </p>
      <ol aria-label="Choices" className="mt-[2.6cqi] flex flex-col gap-[1.1cqi]">
        {demo.options.map((option) => (
          <li
            key={option.letter}
            className="flex items-center gap-[1.8cqi] rounded-md border-2 border-stage-line px-[2cqi] py-[0.9cqi] text-demo-option leading-snug font-medium"
          >
            <span
              aria-hidden="true"
              className="grid size-[5cqi] shrink-0 place-items-center rounded-full border-2 border-stage-ink font-mono font-bold"
            >
              {option.letter}
            </span>
            <span className="sr-only">{option.letter}. </span>
            <span className="min-w-0">{option.label}</span>
          </li>
        ))}
      </ol>
      <div className="mt-[3cqi] grid grid-cols-[minmax(0,1fr)_auto] items-end gap-[6cqi]">
        <div className="flex flex-col gap-[1.2cqi]">
          <p className="flex items-baseline gap-[1.2cqi]">
            <span className="font-mono text-demo-number leading-none font-bold tabular">
              {demo.timeLeft}
            </span>
            <span className="text-demo-option text-ink-2">left</span>
          </p>
          <div className="h-[1.1cqi] overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full origin-left rounded-full bg-stage-ink"
              style={{ transform: `scaleX(${demo.timeShare})` }}
            />
          </div>
        </div>
        <div className="demo-count" style={step(6)}>
          <AnswerCount answered={demo.answered} total={demo.present} size="demo" />
        </div>
      </div>
    </div>
  );
}

/** One option row on a phone, with a choice settling on it (selected, never marked). */
function PhoneOption({ option, picked, at }: { option: StageOption; picked: boolean; at: number }) {
  return (
    <li className="relative flex items-start gap-[1cqi] rounded-sm border border-line-field bg-surface-1 px-[1.2cqi] py-[0.9cqi]">
      {picked ? (
        <span
          aria-hidden="true"
          style={step(at)}
          className="demo-pick absolute -inset-px rounded-sm border-2 border-accent bg-accent-soft"
        />
      ) : null}
      <span className="relative font-mono font-bold">{option.letter}</span>
      <span className="relative line-clamp-2 min-w-0">{option.label}</span>
    </li>
  );
}

/** A student's phone, as the PhoneQuestion and PhoneSent mockups draw it. */
function Phone({
  demo,
  pick,
  sent,
  index,
}: {
  demo: LiveDemo;
  pick: number | null;
  sent: boolean;
  index: number;
}) {
  // The middle phone stands a little lower, so the three read as hands at different heights.
  const offset = ["mt-0", "mt-[7cqi]", "mt-[2.5cqi]"][index] ?? "mt-0";
  const hideOnNarrow = index === 2 ? "hidden @md:block" : "";
  return (
    <div
      className={`demo-rise w-[36cqi] shrink-0 @md:w-[23cqi] ${offset} ${hideOnNarrow}`}
      style={step(index)}
    >
      <div className="rounded-device bg-device-bezel p-[1.1cqi] ring-1 ring-brand-line-strong">
        <div
          data-theme="light"
          className="flex aspect-[9/17] flex-col gap-[1.4cqi] overflow-hidden rounded-device-screen bg-surface-0 p-[2cqi] text-demo-phone leading-snug text-ink-1"
        >
          <div className="flex shrink-0 items-center justify-between gap-[1cqi] font-semibold whitespace-nowrap">
            <span>Question 3 of 20</span>
            {/* The connection dot of the PhoneQuestion mockup; its word does not fit this small. */}
            <span className="size-[1cqi] shrink-0 rounded-full bg-correct" />
          </div>
          <div className="h-[0.6cqi] shrink-0 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full origin-left rounded-full bg-ink-2"
              style={{ transform: `scaleX(${demo.timeShare})` }}
            />
          </div>
          <p className="line-clamp-4 shrink-0 font-medium">{demo.stem}</p>
          {sent ? (
            <div
              className="demo-pick mt-[1cqi] flex flex-col items-center gap-[1cqi] text-center"
              style={step(5)}
            >
              <span className="grid size-[6cqi] place-items-center rounded-full bg-accent-soft text-accent-ink">
                <Icon icon={Check} className="size-[3.6cqi]" />
              </span>
              <span className="font-semibold">Answer sent</span>
              <span className="text-ink-2">Wait for the answer to show.</span>
            </div>
          ) : (
            <ol className="flex min-h-0 flex-col gap-[0.9cqi] overflow-hidden">
              {demo.options.map((option, i) => (
                <PhoneOption
                  key={option.letter}
                  option={option}
                  picked={pick === i}
                  at={4 + index}
                />
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The landing page's picture of a live session (#563): the projector lit at the front of the
 * hall, with students' phones in front of its lower edge. Built in HTML from one gallery question
 * read through the projector's door (`liveDemo.ts`), so no key, mark or rationale is anywhere in
 * it. The phones repeat the projector's question, so they are hidden from assistive technology;
 * the caption says what the picture shows.
 *
 * It plays once when it is first seen (`PlayOnce`): the phones rise, a choice settles on each and
 * the count arrives, in about 1.6s. Reduced motion, or no JavaScript, shows the last frame.
 */
export function LiveClassDemo({ demo = LIVE_DEMO }: { demo?: LiveDemo }) {
  return (
    <figure className="@container m-0" aria-labelledby="live-demo-caption">
      <PlayOnce>
        <Projector demo={demo} />
        <div
          aria-hidden="true"
          className="relative -mt-[11cqi] flex items-start justify-center gap-[5cqi] @md:justify-end @md:gap-[3cqi] @md:pr-[4cqi]"
        >
          {demo.phones.map((phone, index) => (
            <Phone key={index} demo={demo} pick={phone.pick} sent={phone.sent} index={index} />
          ))}
        </div>
      </PlayOnce>
      <figcaption id="live-demo-caption" className="sr-only">
        A live session in class: the question on the projector, students answering on their phones,
        and {demo.answered} of {demo.present} answered so far.
      </figcaption>
    </figure>
  );
}
