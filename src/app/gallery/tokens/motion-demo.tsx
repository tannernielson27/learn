"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

const SPEEDS = ["fast", "base", "slow"] as const;

/** Plays each duration once on demand. Nothing loops. */
export function MotionDemo() {
  const [played, setPlayed] = useState(false);
  return (
    <div className="mt-4 rounded-md border border-line bg-surface-1 p-4">
      <div className="flex flex-col gap-3">
        {SPEEDS.map((speed) => (
          <div key={speed} className="flex items-center gap-4">
            <span className="w-24 font-mono text-xs text-ink-2">--duration-{speed}</span>
            <div className="relative h-6 flex-1 rounded-sm bg-surface-2">
              <div
                className={`absolute top-1 left-1 h-4 w-4 rounded-sm bg-accent transition-[transform,opacity] ease-out-expo duration-${speed}`}
                style={{
                  transform: played ? "translateX(calc(100% * 8))" : "translateX(0)",
                  opacity: played ? 0.6 : 1,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <Button className="mt-4" size="sm" onClick={() => setPlayed((p) => !p)}>
        {played ? "Reset" : "Play"}
      </Button>
    </div>
  );
}
