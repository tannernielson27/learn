import type { ReactNode } from "react";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";
import { EhrPanel } from "./EhrPanel";

export interface RecordLayoutProps {
  /**
   * The record as the reader may see it: a step's view for a student (#335), whole otherwise.
   * Null for a moment with no chart (#469, a loose question in a quiz that plays case studies in
   * place): the work is drawn alone, in the same place, so nothing inside it is remounted.
   */
  record: EhrRecordView | null;
  /** Section to open by id, so an item can point the reader at the chart it needs. */
  openTabId?: string;
  /** A line under the patient's name, for an instructor's "full record" marker. */
  note?: string;
  children: ReactNode;
}

/**
 * The shape every screen that reads from a chart takes: the record beside the work at 1024px and
 * up, above it below that. The panel decides for itself which of its three shapes to be.
 */
export function RecordLayout({ record, openTabId, note, children }: RecordLayoutProps) {
  return (
    <div className="flex min-h-full flex-col lg:flex-row lg:items-start">
      {record === null ? null : <EhrPanel record={record} openTabId={openTabId} note={note} />}
      <div className="min-w-0 flex-1 px-5 py-5 sm:px-8">{children}</div>
    </div>
  );
}
