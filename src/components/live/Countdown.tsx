"use client";

import { useEffect, useState } from "react";
import { COUNTDOWN_REDRAW_MS, CountdownBarView } from "@/components/ui/CountdownBar";
// Module by module, like the rest of what a phone loads: `@/lib/live` value-exports the in-memory
// room, which holds keys and the scoring engine (ADR 0003, `noClientScoring.test.ts`).
import { readCountdown } from "@/lib/live/countdown";
import { timerAnnouncement, type ItemTimer } from "@/lib/live/timer";

export interface CountdownProps {
  timer: ItemTimer;
  /**
   * The session's clock, now, in epoch ms — the transport's `serverNow`, never `Date.now()`. A
   * phone whose own clock is two minutes off would otherwise count down two minutes wrong (#182).
   */
  now: () => number;
  /** `app` for the console and the phone; `stage` for the projector. */
  size?: "app" | "stage";
  className?: string;
}

/**
 * The item's countdown (#182), on the console, the projector and every phone: the shared
 * `CountdownBarView` (amber with "10 seconds left" in words for the last ten seconds, owner
 * decision 7), plus the word for a clock that is up or held, and a live region.
 *
 * **Driven by the end time, not by a timer started on receipt.** What is on the screen is always
 * `endsAt` minus the session's clock now, so a phone that heard about the item late, slept, or has
 * a clock set wrong shows the same number as every other screen in the room. Nothing here decides
 * anything: the server refuses a late answer whatever this says, and a phone keeps Submit for the
 * server's grace after zero.
 *
 * **Heard three times, not sixty.** The visible clock is `role="timer"`, which assistive
 * technology does not read out as it changes. Beside it, a polite live region says "30 seconds
 * left.", "10 seconds left." and "Time is up." — the three moments that change what a student
 * should do — and nothing else (`timerAnnouncement`).
 */
export function Countdown({ timer, now, size = "app", className = "" }: CountdownProps) {
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
  const word = reading.up ? "Time is up" : reading.frozen ? "Paused" : null;

  return (
    <div data-testid="countdown" className={`flex flex-col gap-1 ${className}`.trim()}>
      <CountdownBarView reading={reading} size={size} />
      {word === null ? null : (
        <p
          data-testid="countdown-state"
          className={`font-semibold text-ink-2 ${size === "stage" ? "text-stage-label" : "text-sm"}`}
        >
          {word}
        </p>
      )}
      <p data-testid="countdown-announcement" aria-live="polite" className="sr-only">
        {reading.frozen ? null : timerAnnouncement(reading.leftMs)}
      </p>
    </div>
  );
}
