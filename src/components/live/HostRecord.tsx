"use client";

import { useState } from "react";
import { EhrContent, openTabsAtTime } from "@/components/ehr/EhrContent";
import { isStagedRecord, stepAtPosition } from "@/lib/ngn/chartReveal";
import type { EhrRecord } from "@/lib/ngn/schemas";

export interface HostRecordProps {
  /** The whole patient record the room was started with: the instructor sees all of it. */
  record: EhrRecord;
  /** The room's position, for the step marker. */
  position: number | null;
  /** The case study's title, where a room plays more than one (#469). */
  title?: string;
  /**
   * A student-paced room (#469): every phone is on a step of its own, so there is no class step
   * to mark.
   */
  paced?: boolean;
}

/**
 * The patient record on the instructor's console (#335): the whole record, with a marker saying
 * which step the class is on, since the phones show only what that step has reached. A record with
 * no staged parts is not shown here at all, as before: every phone sees it whole.
 *
 * Folded away by default, so the console's controls stay where an instructor expects them.
 */
export function HostRecord({ record, position, title, paced = false }: HostRecordProps) {
  const firstTime = record.timePoints[0]?.id ?? "";
  const [timeId, setTimeId] = useState(firstTime);
  const [tabId, setTabId] = useState(() => openTabsAtTime(record, firstTime)[0]?.id ?? "");
  // A record nothing is held back from reads the same on every phone at every step, and the
  // console has never shown it: it stays as it was.
  if (!isStagedRecord(record)) return null;
  const step = stepAtPosition(position);
  const note = paced
    ? "Full patient record. Each phone shows only what the step on its screen has reached."
    : `Full patient record. The class is on step ${step}, and phones show only what step ${step} has reached.`;

  return (
    <details data-testid="host-record" className="mt-8 rounded-sm border border-line bg-surface-1">
      <summary className="tap-target flex cursor-pointer items-center px-4 text-sm font-medium text-ink-1">
        {title === undefined ? "Patient record" : `Patient record: ${title}`}
        {paced ? null : <span className="ml-2 text-ink-2">{`· Step ${step}`}</span>}
      </summary>
      <div className="border-t border-line px-4 pt-4 pb-5">
        <EhrContent
          record={record}
          note={note}
          selectedTabId={tabId}
          onSelectTab={setTabId}
          selectedTimeId={timeId}
          onSelectTime={setTimeId}
        />
      </div>
    </details>
  );
}
