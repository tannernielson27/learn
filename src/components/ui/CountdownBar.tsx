"use client";

import { useEffect, useState } from "react";
// Module by module, like the rest of what a phone loads: `@/lib/live` value-exports the in-memory
// room, which holds keys and the scoring engine (ADR 0003).
import { readCountdown, type CountdownReading } from "@/lib/live/countdown";
import { timerAnnouncement, type ItemTimer } from "@/lib/live/timer";

/** How often the clock is redrawn: four times a second keeps a displayed second honest. */
export const COUNTDOWN_REDRAW_MS = 250;

/** The words that join the amber bar in the last ten seconds (owner decision 7). */
export const WARN_WORDS = "10 seconds left";

export interface CountdownBarViewProps {
  reading: CountdownReading;
  /** `app` for the console and the phone; `stage` for the projector, in its type ladder. */
  size?: "app" | "stage";
  className?: string;
}

const SIZES = {
  app: { track: "h-2", time: "min-w-13 text-base", words: "text-sm" },
  stage: {
    track: "h-5",
    time: "min-w-[4ch] text-stage-label",
    words: "text-stage-label",
  },
} as const;

/**
 * A countdown drawn from one reading: a bar and the time as text beside it (never a bar alone,
 * PLAN §5.8). In the last ten seconds the bar turns `--flag` and "10 seconds left" appears in
 * words, so the warning never rests on colour. Nothing pulses and nothing loops.
 *
 * The bar drains by `transform` alone: each redraw sets a new `scaleX` and a linear transition one
 * redraw long carries it there, so the steps run into each other on the compositor. Reduced motion
 * drops the transition and the bar steps.
 */
export function CountdownBarView({ reading, size = "app", className = "" }: CountdownBarViewProps) {
  const look = SIZES[size];
  const warn = reading.warn;
  return (
    <div className={`flex flex-col gap-1 ${className}`.trim()} data-testid="countdown-bar">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className={`${look.track} flex-1 overflow-hidden rounded-full bg-surface-2`}
        >
          <div
            data-testid="countdown-fill"
            className={`h-full origin-left rounded-full transition-transform ease-linear motion-reduce:transition-none ${warn ? "bg-flag" : "bg-accent"}`}
            style={{
              transform: `scaleX(${reading.fraction})`,
              transitionDuration: `${COUNTDOWN_REDRAW_MS}ms`,
            }}
          />
        </div>
        <p
          role="timer"
          className={`${look.time} text-right font-mono font-semibold tabular ${warn ? "text-flag-ink" : "text-ink-1"}`}
        >
          {reading.label}
        </p>
      </div>
      {warn ? <p className={`${look.words} font-semibold text-flag-ink`}>{WARN_WORDS}</p> : null}
    </div>
  );
}

export interface CountdownBarProps extends Omit<CountdownBarViewProps, "reading"> {
  timer: ItemTimer;
  /** The session's clock, now: the transport's `serverNow`, never `Date.now()` (#182). */
  now: () => number;
}

/**
 * The item's countdown, ticking on the session's clock. Draws nothing when the item has no clock.
 * A polite live region beside it says "30 seconds left.", "10 seconds left." and "Time is up."
 * and nothing else (`timerAnnouncement`), as the console's `Countdown` does.
 */
export function CountdownBar({ timer, now, ...rest }: CountdownBarProps) {
  const [at, setAt] = useState(now);
  const running = timer.endsAt;

  useEffect(() => {
    if (running === null) return;
    const redraw = () => {
      const next = now();
      setAt(next);
      if (next >= running) clearInterval(handle);
    };
    const handle = setInterval(redraw, COUNTDOWN_REDRAW_MS);
    redraw();
    return () => clearInterval(handle);
  }, [running, now]);

  const reading = readCountdown(timer, at);
  if (reading === null) return null;
  return (
    <>
      <CountdownBarView reading={reading} {...rest} />
      <p aria-live="polite" className="sr-only">
        {reading.frozen ? null : timerAnnouncement(reading.leftMs)}
      </p>
    </>
  );
}
