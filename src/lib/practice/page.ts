/**
 * What the practice page of one bank shows its student (#241), decided on the server, and what
 * "Start over" does.
 *
 * The order is the rule: the run is opened (or resumed) by a call that re-checks the share and the
 * student's membership, then its items are listed by a second call that checks them again, and only
 * then are the items (with their keys, for the builder to strip) and the run's own answers read.
 * A bank that is not shared with this student, or no longer is, is "missing" and the page is a 404.
 */
import type { SetItem } from "@/lib/assignments/attemptScoring";
import type { RateLimitStore } from "@/lib/rateLimit/store";
import type { OpenedRun } from "@/lib/supabase/practice";
import type { MissedRunRead, MissedSource } from "@/lib/supabase/practiceMissed";
import type { RunSlots } from "./answerRoute";
import { PRACTICE_START_LIMIT, takePracticeLimit } from "./limits";
import {
  buildPracticeView,
  type PracticeCaseStudyRow,
  type PracticeRun,
  type PracticeView,
} from "./view";

export interface PracticePageStore {
  open(student: string, bankId: string, fresh: boolean): Promise<OpenedRun>;
  slots(student: string, runId: string): Promise<RunSlots | null>;
  /** The run's own items with their keys (#271: as recorded at start). Service role. */
  items(student: string, runId: string, ids: readonly string[]): Promise<SetItem[] | null>;
  caseStudies(ids: readonly string[]): Promise<PracticeCaseStudyRow[] | null>;
  answers(runId: string): Promise<Record<string, unknown> | null>;
}

export type PracticePageView =
  { kind: "missing" } | { kind: "failed" } | { kind: "ready"; view: PracticeView };

export async function loadPracticePage(
  store: PracticePageStore,
  student: string,
  bankId: string,
): Promise<PracticePageView> {
  const opened = await store.open(student, bankId, false);
  if (!opened.ok) return { kind: opened.reason === "not_found" ? "missing" : "failed" };
  return loadRunView(store, student, opened.run, false);
}

/**
 * The run's own view, once it has been opened: listed by a call that checks it again, then its
 * items (with keys, for the builder to strip) and its own answers.
 */
export async function loadRunView(
  store: Omit<PracticePageStore, "open">,
  student: string,
  run: PracticeRun,
  missed: boolean,
): Promise<PracticePageView> {
  const listed = await store.slots(student, run.runId);
  if (listed === null) return { kind: "failed" };
  // The run was open a moment ago; listing nothing now means it no longer is.
  if (missed && listed.slots.length === 0) return { kind: "missing" };

  const itemIds = listed.slots.map((slot) => slot.itemId);
  const caseIds = [
    ...new Set(listed.slots.flatMap((slot) => (slot.caseStudyId ? [slot.caseStudyId] : []))),
  ];
  const [items, caseStudies, answers] = await Promise.all([
    store.items(student, run.runId, itemIds),
    store.caseStudies(caseIds),
    store.answers(run.runId),
  ]);
  if (items === null || caseStudies === null || answers === null) return { kind: "failed" };

  return {
    kind: "ready",
    view: buildPracticeView({ run, slots: listed.slots, items, caseStudies, answers, missed }),
  };
}

export interface MissedPageStore extends Omit<PracticePageStore, "open"> {
  /** The missed run's header, when it is live for the student; the database checks the source. */
  header(student: string, runId: string): Promise<MissedRunRead>;
}

export type MissedPageView =
  | { kind: "missing" }
  | { kind: "failed" }
  | { kind: "ready"; view: PracticeView; source: MissedSource };

/**
 * A run of only the questions a student missed (20261023020000): its header first, which answers
 * only for the student's own missed run while its source is still open to them (a 404 otherwise),
 * then the run's own view, with each case-study step played on its own.
 */
export async function loadMissedPracticePage(
  store: MissedPageStore,
  student: string,
  runId: string,
): Promise<MissedPageView> {
  const header = await store.header(student, runId);
  if (!header.ok) return { kind: header.reason === "not_found" ? "missing" : "failed" };
  const { run } = header;
  const page = await loadRunView(
    store,
    student,
    { runId: run.runId, bankId: run.bankId, bankName: run.title, seed: run.seed },
    true,
  );
  return page.kind === "ready" ? { ...page, source: run.source } : page;
}

export type StartOverOutcome = "started" | "rate_limited" | "not_found" | "failed";

/** Opens a new run of the bank for the student. Counted against `practice_start`, failing open. */
export async function startPracticeOver(
  store: Pick<PracticePageStore, "open">,
  limiter: RateLimitStore,
  student: string,
  bankId: string,
): Promise<StartOverOutcome> {
  if (!(await takePracticeLimit(limiter, "practice_start", student, PRACTICE_START_LIMIT))) {
    return "rate_limited";
  }
  const opened = await store.open(student, bankId, true);
  return opened.ok ? "started" : opened.reason;
}
