"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

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
  /** Extra classes for the tab strip, e.g. to make it stick to the top of a scrolling panel. */
  tablistClassName?: string;
}

/**
 * WAI-ARIA tabs with roving tabindex. Tab chips scroll horizontally on narrow screens
 * so this component doubles as the EHR panel's tab strip.
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
  const selected = value ?? internal;

  // The strip scrolls sideways when the tabs outrun it, so a tab selected from outside — an item
  // pointing at a chart section — has to be brought into view. Focus does this for arrow keys.
  useEffect(() => {
    const tab = strip.current?.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(selected)}"]`,
    );
    tab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selected]);

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
      <div
        ref={strip}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={`flex gap-1 overflow-x-auto border-b border-line ${tablistClassName}`.trim()}
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
              className={`tap-target -mb-px shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-[color,border-color] duration-fast ease-out-expo ${
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
