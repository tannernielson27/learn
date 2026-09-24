import type { SupabaseClient } from "@supabase/supabase-js";
import { readAssignmentReportRows, readReportAssignment } from "@/lib/supabase/assignmentReport";
import type { Database } from "@/lib/supabase/database.types";
import { readReportItems } from "@/lib/supabase/sessionReport";
import {
  beginSubmission,
  listExpiredAttempts,
  listMyAttempts,
  readSavedAnswers,
  readSetItems,
  readStudentAssignment,
  recordSubmission,
} from "@/lib/supabase/attempts";
import { readMyResult } from "@/lib/supabase/results";
import type { AttemptPageStore } from "./attemptPage";
import type { ResultsStore } from "./results";
import { AUTO_SUBMIT_BATCH, type AssignmentReportStore } from "./reportLoader";
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

/**
 * The results page's reads (#210). The result and the assignment are read as the student: the
 * definer function answers only them, only about their own attempts, and only after the close.
 * The service role runs the submit at close (narrowed to this student) and reads the items with
 * their keys, which `loadResultsPage` does only once the student's own read has said "released".
 */
export function resultsStore(user: Client, service: Client): ResultsStore {
  return {
    autoSubmit: (filter) => autoSubmitExpired(autoSubmitStore(service), filter),
    result: (assignmentId) => readMyResult(user, assignmentId),
    assignment: (assignmentId) => readStudentAssignment(user, assignmentId),
    items: (ids) => readSetItems(service, ids),
  };
}

/**
 * The assignment report's reads (#211). `author` reads the assignment, its items' names and the
 * report rows as the signed-in author; `service` runs only the submit at close, and only after the
 * author's own read has found the assignment (see `loadAssignmentReport`).
 */
export function assignmentReportStore(author: Client, service: Client): AssignmentReportStore {
  return {
    assignment: (assignmentId) => readReportAssignment(author, assignmentId),
    autoSubmit: (assignmentId) =>
      autoSubmitExpired(autoSubmitStore(service), { assignmentId, limit: AUTO_SUBMIT_BATCH }),
    items: (ids) => readReportItems(author, ids),
    rows: (assignmentId) => readAssignmentReportRows(author, assignmentId),
  };
}
