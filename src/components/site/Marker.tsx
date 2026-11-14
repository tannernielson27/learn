import type { ReactNode } from "react";

export interface MarkerProps {
  /** A time on the 24-hour clock, as a nurse writes one: "0900". */
  time: string;
  children: ReactNode;
  className?: string;
}

/**
 * A section's time stamp on the public site (#563): the time in mono record ink, the section's
 * name in small capitals, and a hairline running on to the edge, the way an entry opens in a
 * patient record. A label over a heading, never the heading itself.
 */
export function Marker({ time, children, className = "" }: MarkerProps) {
  return (
    <p
      className={`flex items-center gap-3 font-mono text-xs tracking-[0.08em] text-brand uppercase ${className}`.trim()}
    >
      <span className="font-semibold tabular">{time}</span>
      <span>{children}</span>
      <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-line" />
    </p>
  );
}
