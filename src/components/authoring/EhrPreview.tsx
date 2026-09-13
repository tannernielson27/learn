"use client";

import { useState } from "react";
import { EhrContent, sectionOf, tabsAtTime } from "@/components/ehr/EhrContent";
import type { EhrRecord } from "@/lib/ngn/schemas";

export interface EhrPreviewProps {
  /** Null until there is enough of the record to show. */
  record: EhrRecord | null;
}

/**
 * The record as the player's panel shows it, with its own open section and time. It renders the
 * panel's content rather than `EhrPanel`, whose pane, drawer and sheet belong to a page layout.
 * Sections and times the author removes fall back to the first, as the panel's content does.
 */
export function EhrPreview({ record }: EhrPreviewProps) {
  const [timeId, setTimeId] = useState<string>();
  const [tabId, setTabId] = useState<string>();

  if (!record) {
    return (
      <p className="text-sm text-ink-2">
        The preview appears once the patient has an age, sex and care setting, and one section is
        written.
      </p>
    );
  }

  const time = record.timePoints.some((point) => point.id === timeId)
    ? timeId!
    : record.timePoints[0]!.id;

  // As in the player: a new time keeps the reader on the section they were reading.
  const selectTime = (next: string) => {
    const open =
      record.tabs.find((tab) => tab.id === tabId && tabsAtTime(record, time).includes(tab)) ??
      tabsAtTime(record, time)[0];
    const same = open && tabsAtTime(record, next).find((tab) => sectionOf(tab) === sectionOf(open));
    setTimeId(next);
    if (same) setTabId(same.id);
  };

  return (
    <EhrContent
      record={record}
      selectedTabId={tabId ?? ""}
      onSelectTab={setTabId}
      selectedTimeId={time}
      onSelectTime={selectTime}
    />
  );
}
