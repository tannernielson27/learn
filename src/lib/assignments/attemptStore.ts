import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  beginSubmission,
  listExpiredAttempts,
  listMyAttempts,
  readSavedAnswers,
  readSetItems,
  readStudentAssignment,
  recordSubmission,
} from "@/lib/supabase/attempts";
import type { AttemptPageStore } from "./attemptPage";
import { autoSubmitExpired, type AutoSubmitStore, type SubmitStore } from "./submitAttempt";

type Client = SupabaseClient<Database>;

/**
 * The real stores behind `submitAttempt` and `autoSubmitExpired`. `user` is the student's own
 * client (begin runs as them); `service` reads the items with their keys and records the score.
 */
export function submitStore(user: Client, service: Client): SubmitStore {
  return {
    begin: (attemptId) => beginSubmission(user, attemptId),
    items: (ids) => readSetItems(service, ids),
    record: (input) => recordSubmission(service, input),
  };
}

/** The service role alone: the submit at close runs for students who are not there. */
export function autoSubmitStore(service: Client): AutoSubmitStore {
  return {
    expired: (filter) => listExpiredAttempts(service, filter),
    items: (ids) => readSetItems(service, ids),
    record: (input) => recordSubmission(service, input),
  };
}

/**
 * The page's reads. The assignment, the attempts and the answers are read as the student, under
 * row level security; only the items (with their keys, to be stripped by `buildAttemptSet`) and
 * the submit at close use the service role.
 */
export function attemptPageStore(user: Client, service: Client): AttemptPageStore {
  return {
    assignment: (assignmentId) => readStudentAssignment(user, assignmentId),
    attempts: (assignmentId) => listMyAttempts(user, assignmentId),
    answers: (attemptId) => readSavedAnswers(user, attemptId),
    items: (ids) => readSetItems(service, ids),
    autoSubmit: (filter) => autoSubmitExpired(autoSubmitStore(service), filter),
  };
}
