import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  openPracticeRun,
  readPracticeCaseStudies,
  readRunAnswers,
  readRunItems,
  readRunSlots,
  recordPracticeResponse,
} from "@/lib/supabase/practice";
import { resultsStore } from "@/lib/assignments/attemptStore";
import { loadResultsPage } from "@/lib/assignments/results";
import {
  readMissedRun,
  readRunMarks,
  startMissedFromAssignment,
  startMissedFromRun,
} from "@/lib/supabase/practiceMissed";
import type { PracticeAnswerStore } from "./answerRoute";
import type { MissedStore } from "./missed";
import type { PracticePageStore } from "./page";

type Client = SupabaseClient<Database>;

/**
 * The real stores behind the practice page and the answer route (#241). Everything is the service
 * role: a student never reads a practice table, an item or a case study themselves. The student is
 * always the one the server verified, and every run call re-checks the share in the database.
 * Items come from the run itself (#271): as recorded when it started, not as the bank is now.
 */
export function practicePageStore(service: Client): PracticePageStore {
  return {
    open: (student, bankId, fresh) => openPracticeRun(service, student, bankId, fresh),
    slots: (student, runId) => readRunSlots(service, student, runId),
    items: (student, runId, ids) => readRunItems(service, student, runId, ids),
    caseStudies: (ids) => readPracticeCaseStudies(service, ids),
    answers: (runId) => readRunAnswers(service, runId),
  };
}

export function practiceAnswerStore(service: Client): PracticeAnswerStore {
  return {
    slots: (student, runId) => readRunSlots(service, student, runId),
    items: (student, runId, ids) => readRunItems(service, student, runId, ids),
    record: (input) => recordPracticeResponse(service, input),
  };
}

/**
 * "Practise the N I missed" (20261023020000). The results page is read as the student, under
 * their own session, exactly as `/learn/assignments/[id]/results` reads it; the runs as the
 * service role, for the student the server verified.
 */
export function missedStore(user: Client, service: Client): MissedStore {
  return {
    slots: (student, runId) => readRunSlots(service, student, runId),
    marks: (runId) => readRunMarks(service, runId),
    fromRun: (student, runId, ids) => startMissedFromRun(service, student, runId, ids),
    results: (student, assignmentId) =>
      loadResultsPage(resultsStore(user, service), assignmentId, student),
    fromAssignment: (student, assignmentId, ids, best) =>
      startMissedFromAssignment(service, student, assignmentId, ids, best),
  };
}

/** A run of missed questions: its header, then the same reads as any run. */
export function missedPageStore(service: Client) {
  return {
    header: (student: string, runId: string) => readMissedRun(service, student, runId),
    ...practicePageStore(service),
  };
}
