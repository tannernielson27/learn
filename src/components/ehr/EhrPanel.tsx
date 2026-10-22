"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ClipboardList } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";
import { EhrContent, openTabsAtTime, sectionOf } from "./EhrContent";
import { EhrSheet } from "./EhrSheet";

const LABEL = "Patient record";
/** Below this the record is a modal sheet; from here to the two-pane breakpoint it is a drawer. */
const DRAWER_QUERY = "(min-width: 768px)";
/**
 * The pane is chosen by `RecordLayout`'s container (900px of its own width), in CSS. Where the
 * browser cannot say whether the pane is showing (no ResizeObserver), the window stands in.
 */
const PANE_QUERY = "(min-width: 1024px)";

/*
 * Inside `RecordLayout` the pane shows once that layout's own container is 900px wide (the
 * `record` container queries, which come after the breakpoints in the stylesheet and so win). A
 * panel drawn on its own, with no such container around it, falls back to the window: 1024px.
 * Written out in full: the stylesheet is built from the class names as they appear in the source.
 */
const PANE =
  "hidden " +
  "lg:sticky lg:top-0 lg:block lg:max-h-dvh lg:w-[45%] lg:max-w-160 lg:shrink-0 lg:overflow-y-auto lg:border-x lg:border-line lg:bg-surface-1 lg:px-6 lg:pt-5 lg:pb-24 " +
  "@max-[56.25rem]/record:hidden " +
  "@min-[56.25rem]/record:sticky @min-[56.25rem]/record:top-0 @min-[56.25rem]/record:block @min-[56.25rem]/record:max-h-dvh @min-[56.25rem]/record:w-[45%] @min-[56.25rem]/record:max-w-160 @min-[56.25rem]/record:shrink-0 @min-[56.25rem]/record:overflow-y-auto @min-[56.25rem]/record:border-x @min-[56.25rem]/record:border-line @min-[56.25rem]/record:bg-surface-1 @min-[56.25rem]/record:px-6 @min-[56.25rem]/record:pt-5 @min-[56.25rem]/record:pb-24";
const OVERLAY = "lg:hidden @max-[56.25rem]/record:block @min-[56.25rem]/record:hidden";

/** Whether an element is laid out at all: the pane is `display: none` until its container fits it. */
function useShown(ref: RefObject<HTMLElement | null>): boolean | null {
  const [shown, setShown] = useState<boolean | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(([entry]) => {
      setShown((entry?.contentRect.width ?? 0) > 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return shown;
}

export interface EhrPanelProps {
  /**
   * A student's view of the record at the step on screen (#335), or the whole record for an
   * author or an instructor. It may change under the panel: a live room moves on, a student goes
   * back a step. The tab and the time being read are kept when the new chart still has them.
   */
  record: EhrRecordView;
  /** The record at the step before, so a tab it opens now is marked "New". */
  previous?: EhrRecordView;
  /** Section to open by id, so an item can point the reader at the chart it needs. */
  openTabId?: string;
  /** A line under the patient's name, for an instructor's "full record" marker. */
  note?: string;
  /** Extra classes for the desktop pane. */
  className?: string;
}

/**
 * The patient's chart, in the three shapes docs/04-DESIGN-DIRECTION.md §3 asks for: a sticky
 * scrolling pane beside the item when `RecordLayout`'s container is 900px or wider, a drawer above
 * the item on a tablet, and a modal bottom sheet behind a persistent chip on a phone.
 *
 * Pane and overlay each render the record, and CSS shows one — the same trick the matrix and row
 * tables use. The open tab lives here, so the reader never loses their place when the layout
 * changes underneath them.
 */
export function EhrPanel({ record, previous, openTabId, note, className = "" }: EhrPanelProps) {
  // Pointing at a section charted once also sets the clock, since it is only there at its own
  // time. A section charted at every time gives no reason to move it.
  const timeOf = (tabId: string | undefined) =>
    record.tabs.find((tab) => tab.id === tabId)?.timePointId;

  const firstTime = record.timePoints[0]?.id ?? "";
  const [chosenTimeId, setSelectedTimeId] = useState(() => timeOf(openTabId) ?? firstTime);
  const [selectedTabId, setSelectedTabId] = useState(
    () =>
      openTabId ??
      openTabsAtTime(record, timeOf(openTabId) ?? firstTime)[0]?.id ??
      record.tabs[0]?.id ??
      "",
  );
  // A time the chart no longer has (a student gone back to a step before it, #335) reads as the
  // first time, without forgetting the one chosen: going forward again lands back on it.
  const selectedTimeId = record.timePoints.some((point) => point.id === chosenTimeId)
    ? chosenTimeId
    : firstTime;
  const [pointedAt, setPointedAt] = useState(openTabId);
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  const wideWindow = useMediaQuery(PANE_QUERY);
  const paneShown = useShown(paneRef);
  const isPane = paneShown ?? wideWindow;

  // The reader can move between sections freely, so the pointed-at tab only wins when the item
  // changes which one it points at. Adjusting during render beats an effect: no wasted paint.
  if (openTabId !== undefined && openTabId !== pointedAt) {
    setPointedAt(openTabId);
    setSelectedTabId(openTabId);
    const pointedTime = timeOf(openTabId);
    if (pointedTime !== undefined) setSelectedTimeId(pointedTime);
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

  // Changing the time holds the reader on the section they were reading, which is the whole
  // point of a trend; only a section that was not charted then sends them back to the first.
  const selectTime = (timeId: string) => {
    setSelectedTimeId(timeId);
    const open = record.tabs.find((tab) => tab.id === selectedTabId);
    const available = openTabsAtTime(record, timeId);
    const sameSection = open && available.find((tab) => sectionOf(tab) === sectionOf(open));
    setSelectedTabId((sameSection ?? available[0])?.id ?? selectedTabId);
  };

  const content = (
    <EhrContent
      record={record}
      previous={previous}
      note={note}
      selectedTabId={selectedTabId}
      onSelectTab={setSelectedTabId}
      selectedTimeId={selectedTimeId}
      onSelectTime={selectTime}
    />
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
      <aside ref={paneRef} aria-label={LABEL} className={`${PANE} ${className}`.trim()}>
        {content}
      </aside>

      <div className={OVERLAY} onKeyDown={onDrawerKeyDown}>
        <div className="sticky top-0 z-20 border-b border-line bg-surface-1 px-4 py-2">
          <button
            ref={chip}
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            className="tap-target inline-flex items-center gap-2 rounded-full border border-field-border px-4 text-sm font-semibold transition-colors duration-fast ease-out-expo hover:bg-surface-2 aria-expanded:border-accent aria-expanded:bg-accent-soft aria-expanded:text-accent-ink"
          >
            <Icon icon={ClipboardList} />
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
