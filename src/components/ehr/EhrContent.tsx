"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tabs } from "@/components/ui/Tabs";
import type { EhrRecord, EhrTab } from "@/lib/ngn/schemas";
import { EhrBlocks } from "./blocks";

export interface EhrContentProps {
  record: EhrRecord;
  selectedTabId: string;
  onSelectTab: (id: string) => void;
  selectedTimeId: string;
  onSelectTime: (id: string) => void;
}

/** A section charted more than once is one section, not several: group by what it is. */
export const sectionOf = (tab: EhrTab) => `${tab.kind}:${tab.title}`;

/**
 * The record as it stood at one time: sections with no time on them throughout, and one variant
 * of each repeated section — the one charted then. A section that was not charted at that time is
 * absent rather than empty, because labs not yet drawn are a finding in themselves.
 */
export function tabsAtTime(record: EhrRecord, timePointId: string): EhrTab[] {
  const timed = new Set(record.tabs.filter((tab) => tab.timePointId !== undefined).map(sectionOf));
  return record.tabs.filter((tab) =>
    timed.has(sectionOf(tab)) ? tab.timePointId === timePointId : true,
  );
}

function PatientHeader({ header }: { header: EhrRecord["patientHeader"] }) {
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
 */
export function EhrContent({
  record,
  selectedTabId,
  onSelectTab,
  selectedTimeId,
  onSelectTime,
}: EhrContentProps) {
  const charted = record.timePoints.length > 1;
  const time = record.timePoints.find((point) => point.id === selectedTimeId);
  const tabs = tabsAtTime(record, selectedTimeId).map((tab) => ({
    id: tab.id,
    label: tab.title,
    content: <EhrBlocks blocks={tab.blocks} />,
  }));

  return (
    <div className="flex min-h-0 flex-col">
      <PatientHeader header={record.patientHeader} />

      {charted ? (
        <div className="pb-3">
          <SegmentedControl
            label="Time"
            size="sm"
            className="max-w-full overflow-x-auto"
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

      <Tabs
        label="Patient record sections"
        tabs={tabs}
        value={selectedTabId}
        onChange={onSelectTab}
        tablistClassName="sticky top-0 z-10 bg-surface-1"
      />
    </div>
  );
}
