"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";

/** How the room inside hands the layout a new chart, or none. Null outside a case-study room. */
const ShowRecord = createContext<((record: EhrRecordView | null) => void) | null>(null);

/**
 * The setter a room calls with each view's record (#335); null where there is no record. A room
 * run from a quiz that plays case studies in place (#469) hands it null on a loose question.
 */
export function useShowLiveRecord(): ((record: EhrRecordView | null) => void) | null {
  return useContext(ShowRecord);
}

export interface LiveRecordLayoutProps {
  /** The chart at the room's step as the page's server render cut it; null when it has none. */
  initial: EhrRecordView | null;
  children: ReactNode;
}

/**
 * A case-study room's patient record, which moves with the room (#335).
 *
 * The page's server render paints the chart at the step the room is on; after that every view the
 * phone fetches when the host moves carries the chart at the new step, and the room hands it here.
 * Neither is ever more than the server cut for that step, so this holds nothing it may not show.
 * A new server render (a refusal's `router.refresh()`) replaces what is held, the same "adjust
 * when a prop changes" pattern `StudentRoom` uses for its state.
 *
 * In a quiz that plays case studies in place (#469) the chart comes and goes: a step shows its
 * case study's, a loose question none. The room stays where it is in the tree either way, so
 * nothing inside it (its connection above all) is remounted when the chart goes.
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
