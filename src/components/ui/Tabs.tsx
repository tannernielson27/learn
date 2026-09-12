"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useMediaQuery } from "./useMediaQuery";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  /** Accessible name for the tab list. */
  label: string;
  tabs: readonly TabItem[];
  /** Controlled selected id. When omitted, Tabs manages its own state. */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  className?: string;
  /** Extra classes for the strip, e.g. to make it stick to the top of a scrolling panel. */
  tablistClassName?: string;
}

/** How far one press of an arrow moves the strip: most of a screenful, but never a token amount. */
const pageDistance = (width: number) => Math.max(width * 0.8, 120);

/**
 * WAI-ARIA tabs with roving tabindex.
 *
 * When the chips outrun the strip — six chart sections in a 45% pane, say — the strip pages with
 * an arrow at each end instead of showing a scrollbar, and snaps so a page always lands on a whole
 * chip rather than halfway through a name. The arrows are pointer affordances only:
 * they are out of the tab order and hidden from screen readers, because arrow keys already move
 * between tabs and bring the one they land on into view. Below 640px they stay out of the way and
 * the chips are swiped, which is the natural gesture there and leaves the whole width for names.
 */
export function Tabs({
  label,
  tabs,
  value,
  defaultValue,
  onChange,
  className = "",
  tablistClassName = "",
}: TabsProps) {
  const baseId = useId();
  const strip = useRef<HTMLDivElement>(null);
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id ?? "");
  const [reach, setReach] = useState({ overflows: false, atStart: true, atEnd: true });
  const selected = value ?? internal;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // A tab selected from outside — an item pointing at a chart section — has to be brought into
  // view. Focus does this on its own for the arrow keys.
  useEffect(() => {
    const tab = strip.current?.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(selected)}"]`,
    );
    tab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selected]);

  // Measuring happens only in the observer's and the listener's callbacks, never in the effect
  // body: the first reading comes from ResizeObserver, which reports as soon as it starts.
  // Showing the arrows only ever narrows the strip, so the two can never flip each other forever.
  useEffect(() => {
    const el = strip.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      const next = {
        overflows: max > 1,
        atStart: el.scrollLeft <= 1,
        atEnd: el.scrollLeft >= max - 1,
      };
      setReach((prev) =>
        prev.overflows === next.overflows &&
        prev.atStart === next.atStart &&
        prev.atEnd === next.atEnd
          ? prev
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [tabs]);

  const page = (direction: -1 | 1) => {
    const el = strip.current;
    if (!el) return;
    el.scrollBy?.({
      left: direction * pageDistance(el.clientWidth),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === selected);
    if (index < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    select(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  };

  return (
    <div className={className}>
      <div className={`flex items-stretch border-b border-line ${tablistClassName}`.trim()}>
        {reach.overflows ? (
          <StripArrow direction="start" disabled={reach.atStart} onClick={() => page(-1)} />
        ) : null}
        <div
          ref={strip}
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          // Vertical padding, cancelled by the margin, keeps the focus ring inside the scroll box.
          className="no-scrollbar -my-1 flex min-w-0 flex-1 snap-x snap-mandatory gap-1 overflow-x-auto px-0.5 py-1"
        >
          {tabs.map((tab) => {
            const isSelected = tab.id === selected;
            return (
              <button
                key={tab.id}
                id={`${baseId}-tab-${tab.id}`}
                data-tab-id={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${baseId}-panel-${tab.id}`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => select(tab.id)}
                className={`tap-target -mb-px shrink-0 snap-start whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-[color,border-color] duration-fast ease-out-expo ${
                  isSelected
                    ? "border-accent text-accent-ink"
                    : "border-transparent text-ink-2 hover:text-ink-1"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {reach.overflows ? (
          <StripArrow direction="end" disabled={reach.atEnd} onClick={() => page(1)} />
        ) : null}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== selected}
          tabIndex={0}
          className="pt-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

function StripArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "start" | "end";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      disabled={disabled}
      onClick={onClick}
      data-strip-arrow={direction}
      className={`tap-target -mb-px hidden w-11 shrink-0 items-center justify-center text-ink-2 transition-[background-color,color,opacity] duration-fast ease-out-expo hover:bg-surface-2 hover:text-ink-1 disabled:pointer-events-none disabled:opacity-25 sm:inline-flex ${
        direction === "start" ? "border-r border-line" : "border-l border-line"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={direction === "start" ? "" : "rotate-180"}
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );
}
