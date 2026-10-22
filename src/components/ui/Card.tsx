import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `raised` uses the card surface; `inset` uses the secondary surface for grouped content. */
  tone?: "raised" | "inset";
  padding?: "none" | "sm" | "md";
}

const tones = {
  raised: "bg-surface-1 border-line",
  inset: "bg-surface-2 border-transparent",
} as const;

const paddings = { none: "", sm: "p-3", md: "p-4 sm:p-6" } as const;

/**
 * The one bordered container in the system (it was `Surface`, which is still exported). Depth
 * comes from the 1px line, never from shadows.
 */
export function Card({ tone = "raised", padding = "md", className = "", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-md border ${tones[tone]} ${paddings[padding]} ${className}`.trim()}
      {...rest}
    />
  );
}
