/**
 * What a student's browser is handed for one practice run (#241), built on the server.
 *
 * Every item goes through `toKeylessItem` before anything is serialized (ADR 0003), with its
 * ordered-response starting order keyed by the server secret over the run's own seed (#219), and
 * then through the option shuffle seeded by the same (#209). The run's seed never leaves here.
 *
 * An item this run has already answered is the one exception, and only for itself: the student
 * was shown its key when they answered it, so on a reload it opens in feedback again with its key,
 * its rationale and its marks. The marks are worked out again here through `scoreSubmission`, the
 * one scoring entry point, so they always agree with the key beside them. Nothing about an item
 * this run has not answered is in the payload beyond what a student may see before answering.
 *
 * Server only: this module reaches the scoring engine, which a student's bundle must not.
 */
import type { SetItem } from "@/lib/assignments/attemptScoring";
import { ehrRecordSchema, type Item } from "@/lib/ngn/schemas";
import { shuffleItem, shuffleSeed } from "@/lib/ngn/shuffle";
import {
  parseSubmission,
  scoreSubmission,
  toKeylessItem,
  type KeylessItem,
  type Reveal,
} from "@/lib/ngn/submit";
import { secretStartingOrderSeed } from "@/lib/supabase/startingOrderSeed";
import {
  itemsOf,
  type PracticeAnswered,
  type PracticeEntry,
  type PracticeItemEntry,
  type PracticeView,
} from "./entries";

export type { PracticeAnswered, PracticeEntry, PracticeItemEntry, PracticeView };

/** The run as the server holds it. `seed` is the server's alone. */
export interface PracticeRun {
  runId: string;
  bankId: string;
  bankName: string;
  seed: string;
}

/** One of the run's items, in play order, as `practice_run_items` lists it. */
export interface PracticeSlot {
  itemId: string;
  caseStudyId: string | null;
  step: number | null;
}

export interface PracticeCaseStudyRow {
  id: string;
  title: string;
  /** As stored: checked against the record schema here. */
  ehr: unknown;
}

export interface PracticeViewInput {
  run: PracticeRun;
  slots: readonly PracticeSlot[];
  items: readonly SetItem[];
  caseStudies: readonly PracticeCaseStudyRow[];
  /** This run's stored answers, by item row id. */
  answers: Readonly<Record<string, unknown>>;
}

/** The item as this run shows it: keyless, started in the secret order, options shuffled. */
export function keylessForRun(item: Item, seed: string): KeylessItem {
  const keyless = toKeylessItem(item, secretStartingOrderSeed(seed, item.id));
  try {
    return shuffleItem(keyless, shuffleSeed(seed, keyless.id));
  } catch {
    // An id outside the seed alphabet cannot be seeded; the author's order gives nothing away.
    return keyless;
  }
}

const revealOf = (item: Item): Reveal => ({
  answerKey: item.answerKey,
  rationale: item.rationale,
  scoring: item.scoring,
});

function answeredOf(item: Item, stored: unknown): PracticeAnswered {
  const parsed = parseSubmission({ response: stored }, item.type);
  if (parsed.ok) {
    try {
      return {
        kind: "scored",
        response: parsed.response,
        reveal: scoreSubmission(item, parsed.response),
      };
    } catch {
      // Falls through: an answer naming elements the item no longer has shows the key alone.
    }
  }
  return { kind: "key", key: revealOf(item) };
}

function entryOf(
  slot: PracticeSlot,
  items: ReadonlyMap<string, Item>,
  input: PracticeViewInput,
): PracticeItemEntry | null {
  const item = items.get(slot.itemId);
  if (!item) return null;
  // A deep copy of what the builder was handed, so nothing it is given is changed.
  const copy = JSON.parse(JSON.stringify(item)) as Item;
  return {
    itemId: slot.itemId,
    item: keylessForRun(copy, input.run.seed),
    answered: Object.hasOwn(input.answers, slot.itemId)
      ? answeredOf(copy, input.answers[slot.itemId])
      : null,
  };
}

function caseStudyEntry(
  id: string,
  slots: readonly PracticeSlot[],
  items: ReadonlyMap<string, Item>,
  input: PracticeViewInput,
): PracticeEntry | null {
  const row = input.caseStudies.find((study) => study.id === id);
  const ehr = ehrRecordSchema.safeParse(row?.ehr);
  if (!row || !ehr.success) return null;
  const steps = [...slots]
    .sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
    .map((slot) => entryOf(slot, items, input));
  // A case study is played whole or not at all: a missing step would renumber the rest.
  if (steps.some((step) => step === null)) return null;
  return {
    kind: "case_study",
    id,
    title: row.title,
    ehr: ehr.data,
    steps: steps as PracticeItemEntry[],
  };
}

function entriesOf(input: PracticeViewInput): PracticeEntry[] {
  const items = new Map(input.items.map((entry) => [entry.rowId, entry.item]));
  const entries: PracticeEntry[] = [];
  const seen = new Set<string>();
  for (const slot of input.slots) {
    if (slot.caseStudyId === null) {
      const entry = entryOf(slot, items, input);
      if (entry) entries.push({ kind: "item", ...entry });
      continue;
    }
    if (seen.has(slot.caseStudyId)) continue;
    seen.add(slot.caseStudyId);
    const steps = input.slots.filter((each) => each.caseStudyId === slot.caseStudyId);
    const study = caseStudyEntry(slot.caseStudyId, steps, items, input);
    if (study) entries.push(study);
  }
  return entries;
}

export function buildPracticeView(input: PracticeViewInput): PracticeView {
  const entries = entriesOf(input);
  const all = entries.flatMap(itemsOf);
  return {
    runId: input.run.runId,
    bankName: input.run.bankName,
    total: all.length,
    answered: all.filter((entry) => entry.answered !== null).length,
    entries,
  };
}
