import type { ReactNode } from "react";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";
import { EhrPanel } from "./EhrPanel";
import { RecordFrame } from "./RecordFrame";

export interface RecordLayoutProps {
  /**
   * The record as the reader may see it: a step's view for a student (#335), whole otherwise.
   * Null for a moment with no chart (#469, a loose question in a quiz that plays case studies in
   * place): the work is drawn alone, in the same place, so nothing inside it is remounted.
   */
  record: EhrRecordView | null;
  /**
   * The record as it stood at the step before, when there is one: a tab it did not have open is
   * marked "New" in this one.
   */
  previous?: EhrRecordView | null;
  /** Section to open by id, so an item can point the reader at the chart it needs. */
  openTabId?: string;
  /** A line under the patient's name, for an instructor's "full record" marker. */
  note?: string;
  children: ReactNode;
}

/**
 * The shape every screen that reads from a chart takes (PLAN §6, D2): the record beside the work
 * once the space it is given is 900px or wider, measured on this layout's own container rather
 * than the window, so it is right inside any page width. The record takes about 45% up to 640px,
 * the work up to 760px, and the two are centred as a pair on a wide screen. Narrower than that the
 * record is a drawer or a sheet above the work; the panel decides which.
 */
export function RecordLayout({ record, previous, openTabId, note, children }: RecordLayoutProps) {
  return (
    <RecordFrame
      panel={
        record === null ? null : (
          <EhrPanel
            record={record}
            previous={previous ?? undefined}
            openTabId={openTabId}
            note={note}
          />
        )
      }
    >
      {children}
    </RecordFrame>
  );
}
