"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";

/** How the room inside hands the layout a new chart. Null outside a case-study room. */
const ShowRecord = createContext<((record: EhrRecordView) => void) | null>(null);

/** The setter a room calls with each view's record (#335); null where there is no record. */
export function useShowLiveRecord(): ((record: EhrRecordView) => void) | null {
  return useContext(ShowRecord);
}

export interface LiveRecordLayoutProps {
  /** The chart at the room's step as the page's server render cut it. */
  initial: EhrRecordView;
  children: ReactNode;
}

/**
 * A case-study room's patient record, which moves with the room (#335).
 *
 * The page's server render paints the chart at the step the room is on; after that every view the
 * phone fetches when the host moves carries the chart at the new step, and the room hands it here.
 * Neither is ever more than the server cut for that step, so this holds nothing it may not show.
 * A new server render (a reconnect's `router.refresh()`) replaces what is held, the same "adjust
 * when a prop changes" pattern `StudentRoom` uses for its state.
 */
export function LiveRecordLayout({ initial, children }: LiveRecordLayoutProps) {
  const [record, setRecord] = useState(initial);
  const [applied, setApplied] = useState(initial);
  if (applied !== initial) {
    setApplied(initial);
    setRecord(initial);
  }
  return (
    <ShowRecord.Provider value={setRecord}>
      <RecordLayout record={record}>{children}</RecordLayout>
    </ShowRecord.Provider>
  );
}
