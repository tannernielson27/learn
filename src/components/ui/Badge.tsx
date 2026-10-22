import type { HTMLAttributes } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** `neutral` for a state ("Draft"), `accent` for something new or selected. */
  tone?: "neutral" | "accent";
  /** A green dot before the word, for a live session. The word still says it. */
  live?: boolean;
}

const TONES = {
  neutral: "bg-surface-2 text-ink-1",
  accent: "bg-accent-soft text-accent-ink",
} as const;

/** A short label on a row or a header: "Live", "Draft", "New". Text, never colour alone. */
export function Badge({
  tone = "neutral",
  live = false,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={`inline-flex h-6.5 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold whitespace-nowrap ${TONES[tone]} ${className}`.trim()}
      {...rest}
    >
      {live ? (
        <span aria-hidden="true" data-live-dot="" className="size-2 rounded-full bg-correct" />
      ) : null}
      {children}
    </span>
  );
}
