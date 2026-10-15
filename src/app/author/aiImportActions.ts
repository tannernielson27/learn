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
  dropEntry,
  restoreEntry,
  type EntryActionInput,
  type ReviewActionDeps,
} from "@/lib/aiImport/review/actions";
import { requireAuthor } from "@/lib/authoring/session";
import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * AI import's Server Functions (#345). Each checks the caller itself (`src/lib/aiImport/upload`):
 * a Server Function is a public endpoint, whatever page it was handed to.
 */

/** The verified teacher (others are sent away, as from every authoring Server Function). */
async function guardedDeps(): Promise<ActionDeps> {
  const session = await requireAuthor("/author");
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

/** Review (#346): the same checks, then the teacher's own session and a version check. */
async function reviewDeps(): Promise<ReviewActionDeps> {
  const session = await requireAuthor("/author");
  return { author: async () => ({ status: "ok", ...session }) };
}

export async function dropAiImportEntry(input: EntryActionInput) {
  return dropEntry(await reviewDeps(), input);
}

export async function restoreAiImportEntry(input: EntryActionInput) {
  return restoreEntry(await reviewDeps(), input);
}
