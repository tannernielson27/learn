import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthorSession, RouteAuthor } from "@/lib/authoring/session";
import type { BatchStatus } from "@/lib/authoring/aiImportUpload";
import type { Database } from "@/lib/supabase/database.types";
import { aiImportEnabled, type AiImportEnv } from "../config";

/**
 * Who may use AI import's upload page and its requests (#345). Every Server Function and route
 * starts here: a signed-in teacher with a workspace, AI import on for the deployment
 * (`AI_IMPORT_ENABLED`) and for the workspace (`orgs.ai_import_enabled`). The workspace and user
 * come from the verified session, never from the request.
 */

export type Client = SupabaseClient<Database>;

export type AiImportAccess =
  | { status: "ok"; author: AuthorSession }
  | { status: "signed_out" }
  | { status: "forbidden" }
  | { status: "disabled" }
  | { status: "unavailable" };

export interface AccessDeps {
  author: () => Promise<RouteAuthor>;
  env?: AiImportEnv;
}

/** Whether the workspace has AI import on, read under the teacher's own RLS. */
export async function workspaceEnabled(author: AuthorSession): Promise<boolean | "unavailable"> {
  const { data, error } = await author.supabase
    .from("orgs")
    .select("ai_import_enabled")
    .eq("id", author.orgId)
    .maybeSingle();
  if (error) {
    console.error("[ai-import] reading the workspace's switch failed", { code: error.code });
    return "unavailable";
  }
  return data?.ai_import_enabled === true;
}

export async function aiImportAccess(deps: AccessDeps): Promise<AiImportAccess> {
  const author = await deps.author();
  if (author.status === "signed_out") return { status: "signed_out" };
  if (author.status === "forbidden") return { status: "forbidden" };
  const { supabase, userId, email, orgId } = author;
  const session: AuthorSession = { supabase, userId, email, orgId };
  if (!aiImportEnabled(deps.env)) return { status: "disabled" };
  const enabled = await workspaceEnabled(session);
  if (enabled === "unavailable") return { status: "unavailable" };
  return enabled ? { status: "ok", author: session } : { status: "disabled" };
}

export interface BatchRow {
  id: string;
  status: BatchStatus;
  bankId: string | null;
}

/** A batch of the caller's own workspace, or null: another workspace's batch is not found. */
export async function readBatch(
  service: Client,
  orgId: string,
  batchId: string,
): Promise<BatchRow | null | "unavailable"> {
  const { data, error } = await service
    .from("ai_import_batches")
    .select("id, status, bank_id")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) {
    console.error("[ai-import] reading a batch failed", { code: error.code });
    return "unavailable";
  }
  if (!data) return null;
  return { id: data.id, status: data.status as BatchStatus, bankId: data.bank_id };
}
