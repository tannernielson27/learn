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
import { authorForRoute } from "@/lib/authoring/session";
import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * AI import's Server Functions (#345). Each checks the caller itself (`src/lib/aiImport/upload`):
 * a Server Function is a public endpoint, whatever page it was handed to.
 */

const deps: ActionDeps = {
  author: authorForRoute,
  service: createSupabaseServiceClient,
  limiter: () => sharedRateLimitStore(),
};

export async function startAiImport(bankId: string, rightsConfirmed: boolean) {
  return startBatch(deps, bankId, rightsConfirmed === true);
}

export async function registerAiImportFile(batchId: string, name: string) {
  return registerUpload(deps, batchId, name);
}

export async function checkAiImportFile(batchId: string, fileId: string) {
  return checkUpload(deps, batchId, fileId);
}

export async function removeAiImportFile(batchId: string, fileId: string) {
  return removeUpload(deps, batchId, fileId);
}

export async function beginAiImportReading(batchId: string) {
  return beginParsing(deps, batchId);
}

export async function finishAiImport(batchId: string) {
  return finishBatch(deps, batchId);
}
