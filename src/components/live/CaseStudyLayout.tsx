import type { ReactNode } from "react";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import type { EhrRecord } from "@/lib/ngn/schemas";

export interface CaseStudyLayoutProps {
  /** The patient record the session was started with, or null for a session run from a bank. */
  record: EhrRecord | null;
  children: ReactNode;
}

/**
 * The page around a student's room (#184).
 *
 * A bank session is the one narrow column it has always been. A case study puts the patient's
 * record beside it in the shape the case study player uses — `RecordLayout`, so the same three
 * forms: a sticky pane beside the step at 1024px and up, a drawer above it on a tablet, and a
 * "Patient record" chip that opens a bottom sheet on a phone. The room itself does not know it is
 * inside a case study; it is handed in as `children`, unchanged.
 *
 * The whole record is shown at every step, with its time selector, exactly as `CaseStudyPlayer`
 * shows it: the tabs a step reads are the reader's to choose, not the step's.
 */
export function CaseStudyLayout({ record, children }: CaseStudyLayoutProps) {
  if (record === null) {
    return <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">{children}</main>;
  }
  return (
    <main className="w-full flex-1">
      <RecordLayout record={record}>
        <div className="mx-auto w-full max-w-lg py-4 sm:py-7">{children}</div>
      </RecordLayout>
    </main>
  );
}
