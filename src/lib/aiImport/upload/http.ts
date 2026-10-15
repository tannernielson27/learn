import { NextResponse } from "next/server";
import { messageFor } from "@/lib/authoring/aiImportUpload";
import { aiImportAccess, readBatch, type AccessDeps, type BatchRow, type Client } from "./access";

/** Shared by the parse and extract routes (#345). JSON only, never cached. */

const NO_STORE = { "Cache-Control": "no-store" };

/** The largest body either route reads: three ids and a number. */
const MAX_BODY_BYTES = 1024;

export function fail(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return NextResponse.json(
    { ok: false, code, message: messageFor(code), ...extra },
    { status, headers: NO_STORE },
  );
}

export function answer(body: Record<string, unknown>): Response {
  return NextResponse.json({ ok: true, ...body }, { headers: NO_STORE });
}

export interface RouteDeps extends AccessDeps {
  service: () => Client;
}

export type Admitted = {
  orgId: string;
  userId: string;
  service: Client;
  batch: BatchRow;
  body: unknown;
};

/**
 * Everything both routes check before their own work: JSON (a cross-site form cannot post it),
 * a teacher, AI import on, a small body, and a batch of the teacher's own workspace that is
 * reading files. AI import off and another workspace's batch both answer 404.
 */
export async function admit(
  request: Request,
  deps: RouteDeps,
  readIds: (body: unknown) => { batchId: string } | null,
): Promise<Admitted | Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return fail(415, "malformed");
  }
  const access = await aiImportAccess(deps);
  if (access.status === "signed_out") return fail(401, "signed_out");
  if (access.status === "forbidden") return fail(403, "forbidden");
  if (access.status === "disabled") return fail(404, "not_found");
  if (access.status === "unavailable") return fail(503, "unavailable");

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail(413, "malformed");
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, "malformed");
    body = JSON.parse(text);
  } catch {
    return fail(400, "malformed");
  }
  const ids = readIds(body);
  if (!ids) return fail(400, "malformed");

  const service = deps.service();
  const batch = await readBatch(service, access.author.orgId, ids.batchId);
  if (batch === "unavailable") return fail(503, "unavailable");
  if (!batch) return fail(404, "not_found");
  if (batch.status !== "parsing") return fail(409, "not_parsing");
  return { orgId: access.author.orgId, userId: access.author.userId, service, batch, body };
}
