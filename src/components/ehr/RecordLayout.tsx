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
    // 56.25rem = 900px, PLAN §6's container width for the 45/55 split.
    <div data-record-layout="" className="@container/record w-full">
      {/* A sticky header inside the work (a live phone's) sits just under the chip's sticky bar
          wherever the chip is drawn: `--record-sticky-top`, read by PhoneHeader. */}
      <div
        className={`flex min-h-full flex-col @min-[56.25rem]/record:flex-row @min-[56.25rem]/record:items-start @min-[56.25rem]/record:justify-center ${record === null ? "" : "@max-[56.25rem]/record:[--record-sticky-top:var(--record-chip-bar)]"}`}
      >
        {record === null ? null : (
          <EhrPanel
            record={record}
            previous={previous ?? undefined}
            openTabId={openTabId}
            note={note}
          />
        )}
        {/* The gutter is a variable so a full-bleed child (a live phone's header) can cancel it. */}
        <div className="min-w-0 flex-1 px-(--record-gutter) py-5 [--record-gutter:1.25rem] sm:[--record-gutter:2rem] @min-[56.25rem]/record:max-w-190 @min-[56.25rem]/record:py-8 @min-[56.25rem]/record:[--record-gutter:2.5rem]">
          {children}
        </div>
      </div>
    </div>
  );
}
