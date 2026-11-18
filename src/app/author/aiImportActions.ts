"use server";

import {
  beginParsing,
  checkUpload,
  finishBatch,
  registerUpload,
  removeUpload,
  startBatch,
  type ActionDeps,
} from "@/lib/aiImport/upload/actions";
import {
  dropEntries,
  dropEntry,
  restoreEntry,
  type EntryActionInput,
  type ReviewActionDeps,
} from "@/lib/aiImport/review/actions";
import { splitCaseStudy } from "@/lib/aiImport/review/split";
import { discardBatch, importBatch, type CommitDeps } from "@/lib/aiImport/commit/actions";
import { requireWriter } from "@/lib/authoring/writer";
import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * AI import's Server Functions (#345). Each checks the caller itself (`src/lib/aiImport/upload`):
 * a Server Function is a public endpoint, whatever page it was handed to.
 */

/** The verified teacher (others are sent away, as from every authoring Server Function). */
async function guardedDeps(): Promise<ActionDeps> {
  const session = await requireWriter("/author");
  return {
    author: async () => ({ status: "ok", ...session }),
    service: createSupabaseServiceClient,
    limiter: () => sharedRateLimitStore(),
  };
}

export async function startAiImport(bankId: string, rightsConfirmed: boolean) {
  return startBatch(await guardedDeps(), bankId, rightsConfirmed === true);
}

export async function registerAiImportFile(batchId: string, name: string) {
  return registerUpload(await guardedDeps(), batchId, name);
}

export async function checkAiImportFile(batchId: string, fileId: string) {
  return checkUpload(await guardedDeps(), batchId, fileId);
}

export async function removeAiImportFile(batchId: string, fileId: string) {
  return removeUpload(await guardedDeps(), batchId, fileId);
}

export async function beginAiImportReading(batchId: string) {
  return beginParsing(await guardedDeps(), batchId);
}

export async function finishAiImport(batchId: string) {
  return finishBatch(await guardedDeps(), batchId);
}

/**
 * Review (#346): the same checks, then the teacher's own session and a version check. The service
 * client is there for the duplicate flags only (#593), which a teacher's session may not write.
 */
async function reviewDeps(): Promise<ReviewActionDeps> {
  const session = await requireWriter("/author");
  return {
    author: async () => ({ status: "ok", ...session }),
    service: createSupabaseServiceClient,
  };
}

export async function dropAiImportEntry(input: EntryActionInput) {
  return dropEntry(await reviewDeps(), input);
}

export async function restoreAiImportEntry(input: EntryActionInput) {
  return restoreEntry(await reviewDeps(), input);
}

/** #593: every entry the page listed as needing an answer or a fix, dropped in one request. */
export async function dropAiImportEntries(input: unknown) {
  return dropEntries(await reviewDeps(), input);
}

/** #593: a staged case study replaced by six separate questions. */
export async function splitAiImportCaseStudy(input: unknown) {
  const session = await requireWriter("/author");
  return splitCaseStudy(
    { author: async () => ({ status: "ok", ...session }), service: createSupabaseServiceClient },
    input,
  );
}

/**
 * Import and discard (#348): the same checks, the teacher's own session for the batch, and the
 * service client only to remove the uploaded files once the database has let them go.
 */
async function commitDeps(): Promise<CommitDeps> {
  const session = await requireWriter("/author");
  return {
    author: async () => ({ status: "ok", ...session }),
    service: createSupabaseServiceClient,
  };
}

export async function importAiImportBatch(input: { batchId: string }) {
  const result = await importBatch(await commitDeps(), input);
  return result.ok
    ? { ok: true as const, questions: result.questions, caseStudies: result.caseStudies }
    : result;
}

export async function discardAiImportBatch(input: { batchId: string }) {
  const result = await discardBatch(await commitDeps(), input);
  return result.ok ? { ok: true as const } : result;
}
