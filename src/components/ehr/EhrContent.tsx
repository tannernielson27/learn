"use client";

import { Tabs } from "@/components/ui/Tabs";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { EhrBlocks } from "./blocks";

export interface EhrContentProps {
  record: EhrRecord;
  selectedTabId: string;
  onSelectTab: (id: string) => void;
}

/**
 * Tab names, keyed by tab id. A record charted at several time points repeats titles — two nurses'
 * notes, labs drawn twice — so the time point disambiguates them. A single-time-point record gains
 * nothing from the suffix and keeps the plain title.
 */
export function tabLabels(record: EhrRecord): Record<string, string> {
  const times = new Map(record.timePoints.map((point) => [point.id, point.label]));
  const showTime = record.timePoints.length > 1;
  return Object.fromEntries(
    record.tabs.map((tab) => {
      const time = tab.timePointId ? times.get(tab.timePointId) : undefined;
      return [tab.id, showTime && time ? `${tab.title} · ${time}` : tab.title];
    }),
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
 * The record itself: who the client is, then one tab per charted section. The caller owns the open
 * tab so a pane and a sheet showing the same record stay on the same section.
 */
export function EhrContent({ record, selectedTabId, onSelectTab }: EhrContentProps) {
  const labels = tabLabels(record);
  const tabs = record.tabs.map((tab) => ({
    id: tab.id,
    label: labels[tab.id]!,
    content: <EhrBlocks blocks={tab.blocks} />,
  }));
  return (
    <div className="flex min-h-0 flex-col">
      <PatientHeader header={record.patientHeader} />
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
