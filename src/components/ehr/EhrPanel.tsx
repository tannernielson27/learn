"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { EhrContent } from "./EhrContent";
import { EhrSheet } from "./EhrSheet";

const LABEL = "Patient record";
/** Below this the record is a modal sheet; from here to the two-pane breakpoint it is a drawer. */
const DRAWER_QUERY = "(min-width: 768px)";
/** At and above this the record is always open in the pane, so there is nothing to disclose. */
const PANE_QUERY = "(min-width: 1024px)";

export interface EhrPanelProps {
  record: EhrRecord;
  /** Section to open by id, so an item can point the reader at the chart it needs. */
  openTabId?: string;
  /** Extra classes for the desktop pane. */
  className?: string;
}

/**
 * The patient's chart, in the three shapes docs/04-DESIGN-DIRECTION.md §3 asks for: a sticky
 * scrolling pane beside the item at 1024px and up, a drawer above the item on a tablet, and a
 * modal bottom sheet behind a persistent chip on a phone.
 *
 * Pane and overlay each render the record, and CSS shows one — the same trick the matrix and row
 * tables use. The open tab lives here, so the reader never loses their place when the layout
 * changes underneath them.
 */
export function EhrPanel({ record, openTabId, className = "" }: EhrPanelProps) {
  const [selectedTabId, setSelectedTabId] = useState(openTabId ?? record.tabs[0]!.id);
  const [pointedAt, setPointedAt] = useState(openTabId);
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  const isPane = useMediaQuery(PANE_QUERY);

  // The reader can move between sections freely, so the pointed-at tab only wins when the item
  // changes which one it points at. Adjusting during render beats an effect: no wasted paint.
  if (openTabId !== undefined && openTabId !== pointedAt) {
    setPointedAt(openTabId);
    setSelectedTabId(openTabId);
  }
  // Widening the window into the two-pane layout closes the overlay rather than leaving it, and
  // its hold on the rest of the page, behind a chip that is no longer there.
  if (isPane && open) setOpen(false);

  // Focus goes back to the chip after the commit, not during the handler: while the sheet is up
  // the chip sits under an inert subtree, where focus() would be ignored.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) chip.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const close = () => setOpen(false);

  const content = (
    <EhrContent record={record} selectedTabId={selectedTabId} onSelectTab={setSelectedTabId} />
  );

  // The drawer sits in the page rather than over it, so it has no focus trap to close it. Escape
  // is wired around the chip and the drawer together, since focus is usually still on the chip.
  // The sheet stops its own Escape, so the two never fire on one press.
  const onDrawerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) close();
  };

  return (
    <>
      {/* Two-pane: the chart scrolls on its own and stops clear of the submit bar. */}
      <aside
        aria-label={LABEL}
        className={`hidden lg:sticky lg:top-0 lg:block lg:max-h-dvh lg:w-[45%] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-line lg:bg-surface-1 lg:px-5 lg:pt-5 lg:pb-24 ${className}`.trim()}
      >
        {content}
      </aside>

      <div className="lg:hidden" onKeyDown={onDrawerKeyDown}>
        <div className="sticky top-0 z-20 border-b border-line bg-surface-1/95 px-4 py-2 backdrop-blur-sm">
          <button
            ref={chip}
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            className="tap-target inline-flex items-center rounded-full border border-line-strong px-4 text-sm font-medium transition-colors duration-fast ease-out-expo hover:bg-surface-2"
          >
            {LABEL}
          </button>
        </div>

        {open && isDrawer ? (
          <div className="max-h-[60dvh] animate-[fade-up_var(--duration-base)_var(--ease-out-expo)_both] overflow-y-auto border-b border-line bg-surface-1 px-4 pt-4 pb-5">
            {content}
          </div>
        ) : null}

        {open && !isDrawer ? (
          <EhrSheet label={LABEL} onClose={close}>
            {content}
          </EhrSheet>
        ) : null}
      </div>
    </>
  );
}
