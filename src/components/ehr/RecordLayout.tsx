import type { ReactNode } from "react";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { EhrPanel } from "./EhrPanel";

export interface RecordLayoutProps {
  record: EhrRecord;
  /** Section to open by id, so an item can point the reader at the chart it needs. */
  openTabId?: string;
  children: ReactNode;
}

/**
 * The shape every screen that reads from a chart takes: the record beside the work at 1024px and
 * up, above it below that. The panel decides for itself which of its three shapes to be.
 */
export function RecordLayout({ record, openTabId, children }: RecordLayoutProps) {
  return (
    <div className="flex min-h-full flex-col lg:flex-row lg:items-start">
      <EhrPanel record={record} openTabId={openTabId} />
      <div className="min-w-0 flex-1 px-5 py-5 sm:px-8">{children}</div>
    </div>
  );
}
