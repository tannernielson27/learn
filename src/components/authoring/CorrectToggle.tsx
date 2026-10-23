import type { ReactNode } from "react";

export interface CorrectToggleProps {
  /** The radio or checkbox that marks a choice correct, named "Option A is correct". */
  children: ReactNode;
}

/**
 * The editors' "this is correct" control (Editor mockup, PLAN D10): the 20px radio or checkbox
 * inside a 44px pill that says Correct, on the accent fill once it is marked. The input keeps its
 * own name ("Option A is correct"), which carries the visible word, so the word is hidden here.
 */
export function CorrectToggle({ children }: CorrectToggleProps) {
  return (
    <label className="tap-target inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-field-border bg-surface-1 px-3 text-sm font-semibold text-ink-1 transition-colors duration-fast hover:bg-surface-2 has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-ink">
      {children}
      <span aria-hidden="true">Correct</span>
    </label>
  );
}
