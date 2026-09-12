"use client";

import type { ButtonHTMLAttributes } from "react";

export interface FlagToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  flagged: boolean;
  /** What is being flagged, for the button's name: "Flag step 2 for review". */
  label: string;
  onChange: (flagged: boolean) => void;
}

/**
 * Flag something to come back to. A toggle button rather than a checkbox, because the flag is an
 * action on the item rather than part of the answer: `aria-pressed` both states it and announces
 * the change, and the word stays "Flag" so the name does not move under the reader.
 */
export function FlagToggle({ flagged, label, onChange, className = "", ...rest }: FlagToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={flagged}
      onClick={() => onChange(!flagged)}
      className={`tap-target inline-flex items-center gap-2 rounded-sm border px-3 text-sm font-medium transition-[background-color,border-color,color] duration-fast ease-out-expo ${
        flagged
          ? "border-flag bg-flag-soft text-ink-1"
          : "border-line text-ink-2 hover:bg-surface-2 hover:text-ink-1"
      } ${className}`.trim()}
      {...rest}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill={flagged ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={flagged ? "text-flag" : ""}
      >
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <path d="M4 22v-7" />
      </svg>
      Flag {label}
    </button>
  );
}
