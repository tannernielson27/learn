import type { Json } from "@/lib/supabase/database.types";
import type { ItemType } from "@/lib/ngn/schemas";
import { ClaudeCallError, type MessagesClient } from "../claude";
import { NO_USAGE, addUsage, aiImportEnabled, costOf, type Usage } from "../config";
import { extractQuestions, regionsOf } from "../extractQuestions";
import {
  POSITIONS_PER_FILE,
  Refused,
  extractUnitDeps,
  reservedCall,
  rowOf,
  unitPayload,
  wholeText,
  type ExtractUnitDeps,
  type ExtractUnitResult,
  type StagedRow,
} from "../extractUnit";
import type { FileRef } from "../files/store";
import { mergeSegments, type MergedQuestion } from "../merge";
import type { Client } from "../upload/access";
import { ENTRY_COLUMNS, type EntryRow } from "./read";

/**
 * Change type (#346): the teacher says what type a question really is, and that one question is
 * read again as that type. It is one extract call (and its one repair), reserved under the
 * workspace's cap and settled, exactly as the first read was: the screen says so before the click.
 *
 * In order, each step refusing before the next one spends anything: AI import on; the entry, of
 * this workspace and batch, a single question, at the version the page showed; the teacher's
 * extract allowance; its file and its place in the file's segments. Then the call, and the entry
 * is rewritten only if it is still at that version. A change that lands in between is refused
 * (`entry_changed`), never overwritten; what was spent on the call stays spent.
 *
 * The caller has checked the teacher, that the batch is in review, and takes the workspace and
 * user from the session.
 */

export interface RetypeDeps extends Pick<
  ExtractUnitDeps,
  | "env"
  | "client"
  | "usageRpc"
  | "takeExtractCall"
  | "loadSegments"
  | "loadFile"
  | "sleep"
  | "random"
> {
  readEntry: (
    orgId: string,
    batchId: string,
    entryId: string,
  ) => Promise<EntryRow | null | "unavailable">;
  /** The id of the batch's file at `place` (upload order, from 0); null when there is none. */
  fileAt: (orgId: string, batchId: string, place: number) => Promise<string | null | "unavailable">;
  /** Rewrites the entry where it is still at `version`; "changed" when it is not. */
  writeEntry: (
    orgId: string,
    batchId: string,
    entryId: string,
    version: number,
    patch: RetypePatch,
  ) => Promise<{ version: number } | "changed" | "unavailable">;
}

export type RetypePatch = Pick<StagedRow, "type" | "status" | "reasons" | "draft" | "item">;

export interface RetypeRequest {
  orgId: string;
  batchId: string;
  entryId: string;
  version: number;
  type: ItemType;
  userId: string;
}

export type RetypeResult =
  | { ok: true; version: number; status: string; usage: Usage; costUsd: number }
  | { ok: false; code: "entry_changed" | "not_retypable" }
  | Extract<ExtractUnitResult, { ok: false }>;

/** The teacher's word stands for the model's guess: the type, sure, and no "no NGN type". */
export const asType = (question: MergedQuestion, type: ItemType): MergedQuestion => ({
  ...question,
  type,
  confidence: 1,
  flags: { ...question.flags, notNgn: null },
});

/** A duplicate flag is the batch's, not the question's reading: it survives a new reading. */
const keptReasons = (old: readonly string[]) =>
  old.filter((reason) => reason.startsWith("duplicate: "));

type Located = {
  ref: FileRef;
  question: MergedQuestion;
  all: MergedQuestion[];
  chunkIds: Map<number, string>;
};

async function locate(
  deps: RetypeDeps,
  request: RetypeRequest,
  position: number,
): Promise<Located | Extract<RetypeResult, { ok: false }>> {
  const place = Math.floor(position / POSITIONS_PER_FILE);
  const fileId = await deps.fileAt(request.orgId, request.batchId, place);
  if (fileId === "unavailable") return { ok: false, code: "unavailable" };
  if (fileId === null) return { ok: false, code: "not_found" };
  const ref: FileRef = { orgId: request.orgId, batchId: request.batchId, fileId };
  const loaded = await deps.loadSegments(ref);
  if (!loaded.ok) return { ok: false, code: loaded.code };
  const all = mergeSegments(loaded.segments).questions;
  const question = all.find((q) => q.position === position % POSITIONS_PER_FILE);
  if (!question) return { ok: false, code: "not_found" };
  return { ref, question, all, chunkIds: loaded.chunkIds };
}

export async function retypeEntry(deps: RetypeDeps, request: RetypeRequest): Promise<RetypeResult> {
  if (!aiImportEnabled(deps.env)) return { ok: false, code: "disabled" };
  const entry = await deps.readEntry(request.orgId, request.batchId, request.entryId);
  if (entry === "unavailable") return { ok: false, code: "unavailable" };
  if (entry === null) return { ok: false, code: "not_found" };
  if (entry.kind !== "item") return { ok: false, code: "not_retypable" };
  if (entry.version !== request.version) return { ok: false, code: "entry_changed" };

  const allowance = await deps.takeExtractCall(request.userId);
  if (allowance !== "ok") return { ok: false, code: allowance };
  const located = await locate(deps, request, entry.position);
  if ("ok" in located) return located;
  const { ref, all, chunkIds } = located;
  const question = asType(located.question, request.type);

  const loaded = await deps.loadFile(ref);
  if (!loaded.ok) return { ok: false, code: loaded.code };
  let document: Awaited<ReturnType<typeof unitPayload>>;
  try {
    document = await unitPayload(loaded.bytes, loaded.prepared, question.chunks);
  } catch {
    return { ok: false, code: "unavailable" };
  }
  let client: MessagesClient;
  try {
    client = deps.client();
  } catch (error) {
    const reason = error instanceof ClaudeCallError ? error.code : "not_configured";
    return { ok: false, code: "claude_failed", reason };
  }

  let usage = NO_USAGE;
  const call = reservedCall(deps, ref, client, document, (spent) => {
    usage = addUsage(usage, spent);
  });
  const sourceText = wholeText(loaded.prepared);
  let staged;
  try {
    [staged] = await extractQuestions(
      call,
      [question],
      { payload: document.payload, kind: loaded.prepared.kind, sourceText },
      regionsOf(all, sourceText),
    );
  } catch (error) {
    if (error instanceof Refused) return error.result;
    const reason = error instanceof ClaudeCallError ? error.code : "connection";
    return { ok: false, code: "claude_failed", reason };
  }
  if (!staged) return { ok: false, code: "unavailable" };

  const row = rowOf(
    staged,
    Math.floor(entry.position / POSITIONS_PER_FILE) * POSITIONS_PER_FILE,
    chunkIds,
  );
  const patch: RetypePatch = {
    type: row.type,
    status: row.status,
    reasons: [...row.reasons, ...keptReasons(entry.reasons)].slice(0, 20),
    draft: row.draft as Json | null,
    item: row.item,
  };
  const written = await deps.writeEntry(
    request.orgId,
    request.batchId,
    request.entryId,
    request.version,
    patch,
  );
  if (written === "unavailable") return { ok: false, code: "unavailable" };
  if (written === "changed") return { ok: false, code: "entry_changed" };
  return { ok: true, version: written.version, status: row.status, usage, costUsd: costOf(usage) };
}

const logged = (step: string, error: { code?: string } | null) => {
  // The code and nothing else: never an entry, which holds the document's words and keys.
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

/** The production wiring, on the service-role client; every query names the workspace. */
export function retypeDeps(service: Client): RetypeDeps {
  const unit = extractUnitDeps(service);
  return {
    client: unit.client,
    usageRpc: unit.usageRpc,
    takeExtractCall: unit.takeExtractCall,
    loadSegments: unit.loadSegments,
    loadFile: unit.loadFile,
    readEntry: async (orgId, batchId, entryId) => {
      const { data, error } = await service
        .from("ai_import_entries")
        .select(ENTRY_COLUMNS)
        .eq("id", entryId)
        .eq("batch_id", batchId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) {
        logged("reading an entry", error);
        return "unavailable";
      }
      return (data as EntryRow | null) ?? null;
    },
    fileAt: async (orgId, batchId, place) => {
      const { data, error } = await service
        .from("ai_import_files")
        .select("id")
        .eq("batch_id", batchId)
        .eq("org_id", orgId)
        .order("created_at")
        .order("id");
      if (error) {
        logged("reading a batch's files", error);
        return "unavailable";
      }
      return data?.[place]?.id ?? null;
    },
    writeEntry: async (orgId, batchId, entryId, version, patch) => {
      const { data, error } = await service
        .from("ai_import_entries")
        .update(patch)
        .eq("id", entryId)
        .eq("batch_id", batchId)
        .eq("org_id", orgId)
        .eq("version", version)
        .select("version");
      if (error) {
        logged("rewriting an entry", error);
        return "unavailable";
      }
      const [written] = data ?? [];
      return written ? { version: written.version } : "changed";
    },
  };
}
