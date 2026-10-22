import type { ReactNode } from "react";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";
import { LiveRecordLayout } from "./LiveRecord";

export interface CaseStudyLayoutProps {
  /**
   * The patient record at the step the room is on (#335), cut on the server by `roomRecord`, or
   * null for a session run from a bank.
   */
  record: EhrRecordView | null;
  /**
   * Whether the chart may come and go as the room moves (#469): a room run from a quiz that plays
   * case studies in place, where a step has its case study's chart and a loose question none. The
   * layout is then the record's from the start, with or without a chart in it.
   */
  changing?: boolean;
  children: ReactNode;
}

/**
 * The page around a student's room (#184).
 *
 * A bank session is the one narrow column it has always been. A case study puts the patient's
 * record beside it in the shape the case study player uses — `RecordLayout`, so the same three
 * forms: a sticky pane beside the step at 1024px and up, a drawer above it on a tablet, and a
 * "Patient record" chip that opens a bottom sheet on a phone. The room itself is handed in as
 * `children`; it passes each view's chart up through `useShowLiveRecord`.
 *
 * Since #335 the record is the chart at the room's step, not the whole record: what an author
 * holds back until a later step is not on the page, and a tab locked at this step shows its name
 * and the word "Locked".
 */
export function CaseStudyLayout({ record, changing = false, children }: CaseStudyLayoutProps) {
  if (record === null && !changing) {
    return <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">{children}</main>;
  }
  return (
    <main className="w-full flex-1">
      <LiveRecordLayout initial={record}>
        <div className="mx-auto w-full max-w-lg py-4 sm:py-7">{children}</div>
      </LiveRecordLayout>
    </main>
  );
}
