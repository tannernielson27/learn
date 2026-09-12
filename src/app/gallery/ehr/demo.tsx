"use client";

import { useState, useSyncExternalStore } from "react";
import { EhrPanel } from "@/components/ehr/EhrPanel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { sampleEhr } from "@/lib/ngn/fixtures";

const noopSubscribe = () => () => {};
/** False during server render and hydration, true after; e2e waits for it before screenshots. */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

const TITLES = Object.fromEntries(sampleEhr.tabs.map((tab) => [tab.id, tab.title]));
const POINTERS = [
  { value: "tab_hp", label: "History" },
  { value: "tab_notes_1400", label: "1400 note" },
  { value: "tab_labs", label: "Labs" },
] as const;
type Pointer = (typeof POINTERS)[number]["value"];

/**
 * The panel beside a stand-in for the item column, so the two-pane proportions, the tablet drawer
 * and the phone sheet can all be checked from one page.
 */
export function EhrPanelDemo() {
  const [openTabId, setOpenTabId] = useState<Pointer>(POINTERS[0].value);
  const hydrated = useHydrated();

  return (
    <div data-hydrated={hydrated}>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Item points at"
          size="sm"
          options={POINTERS}
          value={openTabId}
          onChange={setOpenTabId}
        />
        <span className="font-mono text-xs text-ink-2">{TITLES[openTabId]}</span>
      </div>

      <div className="mt-6 overflow-hidden rounded-md border border-line lg:flex lg:items-start">
        <EhrPanel record={sampleEhr} openTabId={openTabId} />
        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6">
          <p className="eyebrow">Stand-in for the item</p>
          <p className="stem mt-2">
            The item column keeps its own scroll. Reading the chart never moves the question, and
            the record never covers the submit bar at the bottom of this column.
          </p>
          <p className="mt-4 text-sm text-ink-2">
            Below 1024px the chart leaves the flow: a drawer opens above this column on a tablet,
            and a modal sheet rises from the bottom edge on a phone.
          </p>
        </div>
      </div>
    </div>
  );
}
