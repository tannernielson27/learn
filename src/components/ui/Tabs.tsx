"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useMediaQuery } from "./useMediaQuery";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  /**
   * Listed but not openable (#335): a patient record tab locked at this step. Drawn with a lock
   * and the word "Locked", announced as unavailable, skipped by the arrow keys, and given no panel,
   * so there is nothing behind it to show. `content` is not rendered for a locked tab.
   */
  locked?: boolean;
  /**
   * A short word beside the label, such as "New" on a patient record tab a step has just opened.
   * Shown, but kept out of the tab's name so the tab is found by its label alone; `badgeNote` is
   * read as its description.
   */
  badge?: string;
  badgeNote?: string;
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
    if (tabs.find((tab) => tab.id === id)?.locked) return;
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  // The arrow keys move between the tabs that can be opened; a locked one is passed over.
  const openable = tabs.filter((tab) => !tab.locked);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = openable.findIndex((t) => t.id === selected);
    if (index < 0) return;
    const count = openable.length;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % count;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + count) % count;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = count - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = openable[nextIndex];
    if (!next) return;
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
          // No horizontal padding: with snapping it moves the resting scroll position off zero, and
          // the start arrow would read as enabled at the start.
          className="no-scrollbar -my-1 flex min-w-0 flex-1 snap-x snap-mandatory gap-1 overflow-x-auto py-1"
        >
          {tabs.map((tab) => {
            if (tab.locked)
              return <LockedTab key={tab.id} id={`${baseId}-tab-${tab.id}`} tab={tab} />;
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
                aria-describedby={tab.badge ? `${baseId}-badge-${tab.id}` : undefined}
                onClick={() => select(tab.id)}
                className={`tap-target -mb-px inline-flex shrink-0 snap-start items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-[color,border-color] duration-fast ease-out-expo ${
                  isSelected
                    ? "border-accent text-accent-ink"
                    : "border-transparent text-ink-2 hover:text-ink-1"
                }`}
              >
                {tab.label}
                {tab.badge ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-flex h-5 items-center rounded-full bg-accent-soft px-2 text-xs font-semibold text-accent-ink"
                    >
                      {tab.badge}
                    </span>
                    {/* Hidden, so it is no part of the name; a description may point at it. */}
                    <span id={`${baseId}-badge-${tab.id}`} hidden>
                      {tab.badgeNote ?? tab.badge}
                    </span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
        {reach.overflows ? (
          <StripArrow direction="end" disabled={reach.atEnd} onClick={() => page(1)} />
        ) : null}
      </div>
      {openable.map((tab) => (
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

/**
 * A tab that is there but cannot be opened (#335). `aria-disabled` rather than `disabled`, so a
 * screen reader still finds it in the list and says it is unavailable; the word "Locked" beside
 * the lock says the same to everyone else, so neither the icon nor the dimming is the only sign.
 * It controls no panel, takes no focus from the arrow keys, and a press does nothing.
 */
function LockedTab({ id, tab }: { id: string; tab: TabItem }) {
  return (
    <button
      id={id}
      data-tab-id={tab.id}
      type="button"
      role="tab"
      aria-selected={false}
      aria-disabled="true"
      tabIndex={-1}
      className="tap-target -mb-px inline-flex shrink-0 cursor-not-allowed snap-start items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-ink-2"
    >
      {tab.label}{" "}
      <span className="inline-flex items-center gap-1 text-xs font-normal">
        <LockIcon />
        Locked
      </span>
    </button>
  );
}

/** Lucide's "lock", at 16px beside the chip's text, stroke 1.75 (docs/04 §7). */
function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
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
