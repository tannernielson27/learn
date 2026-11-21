"use client";

import dynamic from "next/dynamic";
import { Suspense, createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { RecordFrame } from "@/components/ehr/RecordFrame";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";

/**
 * The patient record's panel as its own chunk, so a phone in a bank session never downloads it:
 * only a case-study room renders this layout, and the rooms import this file for
 * `useShowLiveRecord` alone. The page's server render still paints the panel, so a case study's
 * first paint is what it was. The panel has a Suspense boundary of its own: with none, a panel
 * still loading would suspend the room around it, and the room hydrates without waiting for it.
 */
// The `import()` is written inline so Next sees it and preloads the chunk with a server render.
const EhrPanel = dynamic(() =>
  import("@/components/ehr/EhrPanel").then((module) => module.EhrPanel),
);

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
  // A quiz room that starts on a loose question has no panel in its server render; fetching the
  // chunk now means the first step that brings a chart does not wait for it.
  useEffect(() => {
    void import("@/components/ehr/EhrPanel");
  }, []);
  return (
    <ShowRecord.Provider value={setRecord}>
      <RecordFrame
        panel={
          record === null ? null : (
            <Suspense fallback={null}>
              <EhrPanel record={record} />
            </Suspense>
          )
        }
      >
        {children}
      </RecordFrame>
    </ShowRecord.Provider>
  );
}
