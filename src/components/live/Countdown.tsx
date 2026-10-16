"use client";

import { useEffect, useState } from "react";
// Module by module, like the rest of what a phone loads: `@/lib/live` value-exports the in-memory
// room, which holds keys and the scoring engine (ADR 0003, `noClientScoring.test.ts`).
import { formatClock, remainingMs, timerAnnouncement, type ItemTimer } from "@/lib/live/timer";

export interface CountdownProps {
  timer: ItemTimer;
  /**
   * The session's clock, now, in epoch ms — the transport's `serverNow`, never `Date.now()`. A
   * phone whose own clock is two minutes off would otherwise count down two minutes wrong (#182).
   */
  now: () => number;
}

/** How often the clock is redrawn. Four times a second keeps a displayed second honest. */
const REDRAW_MS = 250;

/** The last stretch, when the bar takes the flag colour. The clock's own number says it too. */
const URGENT_MS = 10_000;

/**
 * The item's countdown (#182), on the console and on every phone.
 *
 * **Driven by the end time, not by a timer started on receipt.** What is on the screen is always
 * `endsAt` minus the session's clock now, so a phone that heard about the item late, slept, or has
 * a clock set wrong shows the same number as every other screen in the room. Nothing here decides
 * anything: the server refuses a late answer whatever this says.
 *
 * **Heard three times, not sixty.** The visible clock is `role="timer"`, which assistive
 * technology does not read out as it changes. Beside it, a polite live region says "30 seconds
 * left.", "10 seconds left." and "Time is up." — the three moments that change what a student
 * should do — and nothing else (`timerAnnouncement`).
 *
 * **Motion.** The bar shrinks by `transform` alone. Each redraw sets a new `scaleX` and a linear
 * transition exactly one redraw long carries it there, so the steps run into each other and the
 * bar drains smoothly on the compositor, with no animation loop in script. Reduced motion drops
 * the transition and the bar steps. In the last ten seconds the bar swaps to the flag amber (a
 * swap, not a colour animation); nothing flashes and nothing turns red, which is reserved for
 * feedback (docs/04-DESIGN-DIRECTION.md). Colour is never the only signal: the clock beside the
 * bar says the same thing in numbers.
 */
export function Countdown({ timer, now }: CountdownProps) {
  const [at, setAt] = useState(now);
  const running = timer.endsAt;

  useEffect(() => {
    if (running === null) return;
    const redraw = () => {
      const next = now();
      setAt(next);
      if (next >= running) clearInterval(handle);
    };
    const handle = setInterval(redraw, REDRAW_MS);
    redraw();
    return () => clearInterval(handle);
  }, [running, now]);

  const left = remainingMs(timer, at);
  if (left === null) return null;

  const frozen = timer.remainingMs !== null;
  const whole = timer.seconds === null ? left : timer.seconds * 1_000;
  const share = whole <= 0 ? 0 : Math.min(1, left / whole);
  const word = left === 0 ? "Time is up" : frozen ? "Paused" : "Time left";
  const urgent = left <= URGENT_MS;

  return (
    <div className="mt-4" data-testid="countdown" data-urgent={urgent ? "true" : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <p data-testid="countdown-state" className="text-sm text-ink-2">
          {word}
        </p>
        <p role="timer" className="tabular font-mono text-2xl text-ink-1">
          {formatClock(left)}
        </p>
      </div>
      <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-sm bg-surface-2">
        <div
          data-testid="countdown-bar"
          className={`h-full origin-left transition-transform ease-linear motion-reduce:transition-none ${
            urgent ? "bg-flag" : "bg-ink-2"
          }`}
          style={{ transform: `scaleX(${share})`, transitionDuration: `${REDRAW_MS}ms` }}
        />
      </div>
      <p data-testid="countdown-announcement" aria-live="polite" className="sr-only">
        {frozen ? null : timerAnnouncement(left)}
      </p>
    </div>
  );
}
