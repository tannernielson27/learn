/**
 * The shapes of a practice run as a student's browser holds it (#241), and nothing else: no
 * scoring, no key-reading code. Built on the server by `view.ts`; read by the player.
 */
import type { AnyResponse, EhrRecord } from "@/lib/ngn/schemas";
import type { KeylessItem, Reveal, ScoreReveal } from "@/lib/ngn/submit";

/** How an answered item reopens: with its marks, or (a stored answer that no longer parses) its key. */
export type PracticeAnswered =
  { kind: "scored"; response: AnyResponse; reveal: ScoreReveal } | { kind: "key"; key: Reveal };

export interface PracticeItemEntry {
  /** The item's row id: what an answer names it by. */
  itemId: string;
  item: KeylessItem;
  answered: PracticeAnswered | null;
}

export type PracticeEntry =
  | ({ kind: "item" } & PracticeItemEntry)
  | { kind: "case_study"; id: string; title: string; ehr: EhrRecord; steps: PracticeItemEntry[] };

export interface PracticeView {
  runId: string;
  bankName: string;
  /** Items and case-study steps in the run. */
  total: number;
  answered: number;
  entries: PracticeEntry[];
}

/** Every item of an entry: the item itself, or a case study's steps. */
export function itemsOf(entry: PracticeEntry): PracticeItemEntry[] {
  return entry.kind === "item" ? [entry] : entry.steps;
}
