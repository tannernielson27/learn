import type { SupabaseClient } from "@supabase/supabase-js";
import { readSetItems } from "@/lib/supabase/attempts";
import type { Database } from "@/lib/supabase/database.types";
import {
  openPracticeRun,
  readPracticeCaseStudies,
  readRunAnswers,
  readRunSlots,
  recordPracticeResponse,
} from "@/lib/supabase/practice";
import type { PracticeAnswerStore } from "./answerRoute";
import type { PracticePageStore } from "./page";

type Client = SupabaseClient<Database>;

/**
 * The real stores behind the practice page and the answer route (#241). Everything is the service
 * role: a student never reads a practice table, an item or a case study themselves. The student is
 * always the one the server verified, and every run call re-checks the share in the database.
 */
export function practicePageStore(service: Client): PracticePageStore {
  return {
    open: (student, bankId, fresh) => openPracticeRun(service, student, bankId, fresh),
    slots: (student, runId) => readRunSlots(service, student, runId),
    items: (ids) => readSetItems(service, ids),
    caseStudies: (ids) => readPracticeCaseStudies(service, ids),
    answers: (runId) => readRunAnswers(service, runId),
  };
}

export function practiceAnswerStore(service: Client): PracticeAnswerStore {
  return {
    slots: (student, runId) => readRunSlots(service, student, runId),
    items: (ids) => readSetItems(service, ids),
    record: (input) => recordPracticeResponse(service, input),
  };
}
