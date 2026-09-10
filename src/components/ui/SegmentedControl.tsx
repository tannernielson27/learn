"use client";

import { useId, type KeyboardEvent } from "react";

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
}

export interface SegmentedControlProps<V extends string> {
  /** Accessible name for the group. */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A radio-group styled as a segmented control. Arrow keys move selection; roving tabindex.
 * Used for the theme toggle and, later, for matrix rows on narrow screens.
 */
export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  className = "",
}: SegmentedControlProps<V>) {
  const id = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((o) => o.value === value);
    if (index < 0) return;
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = options[(index + delta + options.length) % options.length];
    onChange(next.value);
    const el = document.getElementById(`${id}-${next.value}`);
    el?.focus();
  };

  const pad = size === "sm" ? "px-3 text-sm" : "px-4 text-base";

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`inline-flex rounded-sm border border-line bg-surface-1 p-0.5 ${className}`.trim()}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`${id}-${option.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`tap-target rounded-sm ${pad} font-medium transition-[background-color,color] duration-fast ease-out-expo ${
              selected
                ? "bg-accent-soft text-accent-ink"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink-1"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
