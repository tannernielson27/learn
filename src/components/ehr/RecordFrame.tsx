import type { ReactNode } from "react";

export interface RecordFrameProps {
  /** The record's panel, or null for a moment with no chart. */
  panel: ReactNode;
  children: ReactNode;
}

/**
 * `RecordLayout`'s frame, with the panel handed in; `RecordLayout` describes the shape. Apart so a
 * screen that loads the panel itself can use it without importing `EhrPanel`: the live room
 * (`LiveRecordLayout`), whose panel is a lazy chunk so a bank session never fetches it.
 */
export function RecordFrame({ panel, children }: RecordFrameProps) {
  return (
    // 56.25rem = 900px, PLAN §6's container width for the 45/55 split.
    <div data-record-layout="" className="@container/record w-full">
      {/* A sticky header inside the work (a live phone's) sits just under the chip's sticky bar
          wherever the chip is drawn: `--record-sticky-top`, read by PhoneHeader. */}
      <div
        className={`flex min-h-full flex-col @min-[56.25rem]/record:flex-row @min-[56.25rem]/record:items-start @min-[56.25rem]/record:justify-center ${panel === null ? "" : "@max-[56.25rem]/record:[--record-sticky-top:var(--record-chip-bar)]"}`}
      >
        {panel}
        {/* The gutter is a variable so a full-bleed child (a live phone's header) can cancel it. */}
        <div className="min-w-0 flex-1 px-(--record-gutter) py-5 [--record-gutter:1.25rem] sm:[--record-gutter:2rem] @min-[56.25rem]/record:max-w-190 @min-[56.25rem]/record:py-8 @min-[56.25rem]/record:[--record-gutter:2.5rem]">
          {children}
        </div>
      </div>
    </div>
  );
}
