"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tabs } from "@/components/ui/Tabs";
import type { EhrRecordView, EhrTabView } from "@/lib/ngn/chartReveal";
import { EhrBlocks } from "./blocks";

export interface EhrContentProps {
  /**
   * The record to show: a student's view of it at one step (`recordAtStep`, #335), or, for an
   * author and an instructor, the whole record, which reads as a view of itself.
   */
  record: EhrRecordView;
  selectedTabId: string;
  onSelectTab: (id: string) => void;
  selectedTimeId: string;
  onSelectTime: (id: string) => void;
  /** A line under the patient's name: an instructor's "full record" marker (#335). */
  note?: string;
}

/** A section charted more than once is one section, not several: group by what it is. */
export const sectionOf = (tab: Pick<EhrTabView, "kind" | "title">) => `${tab.kind}:${tab.title}`;

/**
 * The record as it stood at one time: every section with no time on it, plus the sections charted
 * then. A section that was not charted at that time is absent rather than empty, because labs not
 * yet drawn are a finding in themselves.
 */
export function tabsAtTime(record: EhrRecordView, timePointId: string): EhrTabView[] {
  return record.tabs.filter(
    (tab) => tab.timePointId === undefined || tab.timePointId === timePointId,
  );
}

/** The tabs at a time that can be opened: every one but a tab locked at this step (#335). */
export function openTabsAtTime(record: EhrRecordView, timePointId: string): EhrTabView[] {
  return tabsAtTime(record, timePointId).filter((tab) => !tab.locked);
}

function PatientHeader({ header }: { header: EhrRecordView["patientHeader"] }) {
  const description = `${header.age}-year-old ${header.sex}`;
  const meta = [
    header.name ? description : null,
    header.setting,
    header.admissionDate ? `Admitted ${header.admissionDate}` : null,
  ].filter(Boolean);
  return (
    <div className="pb-3">
      <p className="eyebrow">Patient record</p>
      <h2 className="mt-1 text-lg font-semibold">{header.name ?? description}</h2>
      <p className="mt-1 text-sm text-ink-2">{meta.join(" · ")}</p>
    </div>
  );
}

/**
 * The record itself: who the client is, when it is being read at, and the sections charted then.
 * The caller owns the open tab and the chosen time, so a pane and a sheet showing the same record
 * stay on the same section at the same hour.
 *
 * A tab locked at this step (#335) is in the tab bar by name, with a lock and the word "Locked",
 * and cannot be opened. Its view carries no blocks, so there is nothing behind it to draw.
 */
export function EhrContent({
  record,
  selectedTabId,
  onSelectTab,
  selectedTimeId,
  onSelectTime,
  note,
}: EhrContentProps) {
  const charted = record.timePoints.length > 1;
  const time = record.timePoints.find((point) => point.id === selectedTimeId);
  const shown = tabsAtTime(record, selectedTimeId);
  const tabs = shown.map((tab) =>
    tab.locked
      ? { id: tab.id, label: tab.title, content: null, locked: true }
      : { id: tab.id, label: tab.title, content: <EhrBlocks blocks={tab.blocks} /> },
  );
  // A selection Tabs has no tab for would leave nothing open and nothing in the tab order, so the
  // first tab that can be opened stands in until the caller catches up. A locked tab never does.
  const openable = shown.filter((tab) => !tab.locked);
  const open = openable.some((tab) => tab.id === selectedTabId) ? selectedTabId : openable[0]?.id;

  return (
    <div className="flex min-h-0 flex-col">
      <PatientHeader header={record.patientHeader} />
      {note ? (
        <p data-testid="record-note" className="measure pb-3 text-sm text-ink-2">
          {note}
        </p>
      ) : null}

      {charted ? (
        <div className="pb-3">
          <SegmentedControl
            label="Time"
            size="sm"
            // The padding, cancelled by the margin, leaves room for the focus ring the scroll clips.
            className="-m-1 max-w-full overflow-x-auto p-1"
            options={record.timePoints.map((point) => ({
              value: point.id,
              label: point.label,
            }))}
            value={selectedTimeId}
            onChange={onSelectTime}
          />
          {/* The segments announce themselves on focus; this is for a change made any other way. */}
          <p role="status" className="sr-only">
            {time ? `Showing ${time.label}` : ""}
          </p>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="border-t border-line pt-4 text-sm text-ink-2">No entries at this time.</p>
      ) : (
        <Tabs
          label="Patient record tabs"
          tabs={tabs}
          value={open ?? ""}
          onChange={onSelectTab}
          tablistClassName="sticky top-0 z-10 bg-surface-1"
        />
      )}
    </div>
  );
}
