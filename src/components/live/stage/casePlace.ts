/**
 * What the projector says about a case study step (CaseStage mockup): who the client is, the
 * time the record has reached, and which tabs are new at this step. The record itself stays on
 * the phones (PLAN §6); the stage only points students at the part that changed.
 *
 * Read from the host's whole record with `recordAtStep`, the same cut every phone is served, so
 * the stage never names a tab the class cannot open yet.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { recordAtStep, stepAtPosition, type EhrTabView } from "@/lib/ngn/chartReveal";
import { FIRST_STEP, type EhrRecord } from "@/lib/ngn/schemas";

export interface CasePlace {
  /** "74-year-old female · Orthopedic unit". */
  patient: string;
  /** The latest time point charted at this step, or null for a record with none. */
  time: string | null;
  /** Tab titles that opened or gained content at this step, in the record's order. */
  newTabs: string[];
}

/** The patient header as one line, the way `EhrContent` describes the client. */
export function patientLine(header: EhrRecord["patientHeader"]): string {
  const description = `${header.age}-year-old ${header.sex}`;
  return [header.name ?? null, description, header.setting].filter(Boolean).join(" · ");
}

/** A tab's open content, comparable across steps; null when it is locked or not there. */
function openContent(tab: EhrTabView | undefined): string | null {
  if (tab === undefined || tab.locked) return null;
  return JSON.stringify(tab.blocks);
}

/** Where the class is in the record at `position`, its step counted from the case study's start. */
export function casePlace(record: EhrRecord, position: number | null): CasePlace {
  const step = stepAtPosition(position);
  const now = recordAtStep(record, step);
  const before = step > FIRST_STEP ? recordAtStep(record, (step - 1) as typeof step) : null;
  const earlier = new Map((before?.tabs ?? []).map((tab) => [tab.id, tab]));
  const newTabs =
    before === null
      ? []
      : now.tabs
          .filter((tab) => {
            const content = openContent(tab);
            return content !== null && content !== openContent(earlier.get(tab.id));
          })
          .map((tab) => tab.title);
  return {
    patient: patientLine(now.patientHeader),
    time: now.timePoints.at(-1)?.label ?? null,
    // A tab charted at more than one time is one tab to a student.
    newTabs: [...new Set(newTabs)],
  };
}
