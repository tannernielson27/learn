/**
 * `POST /api/assignments/save` — autosave one answer of an open attempt (#208).
 *
 * Runs as the signed-in student: `save_attempt_response` takes their identity from the JWT, checks
 * that the attempt is theirs and open, the window, their membership, the item and the rate limit,
 * and writes last-write-wins. This handler only reads the request: JSON only (so a cross-site form
 * post cannot reach it), a bounded body, two uuids and a response that passes the response schemas.
 * What comes back is when it was saved and nothing else — never a mark, never a key.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_ITEM_PAYLOAD_BYTES, withinItemSizeLimit } from "@/lib/authoring/payloadSize";
import { isUuid } from "@/lib/authoring/ids";
import { responseSchema } from "@/lib/ngn/schemas";
import { saveAnswer } from "@/lib/supabase/attempts";
import type { Database, Json } from "@/lib/supabase/database.types";
import { ATTEMPT_REFUSALS, type AttemptRefusal } from "./attemptRefusals";
import { ATTEMPT_SAVE_ROUTE } from "./saveClient";

export const SAVE_ROUTE = ATTEMPT_SAVE_ROUTE;

export interface SaveRouteDeps {
  /** The student's own client, from the request's cookies. */
  client: () => Promise<SupabaseClient<Database>>;
}

/** The body a browser posts. */
export interface SaveRequestBody {
  attemptId: string;
  itemId: string;
  response: unknown;
}

/** A successful save: when the database took it. */
export interface SaveAckPayload {
  savedAt: string;
}

export interface SaveRefusalPayload {
  refusal: AttemptRefusal;
  error: string;
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

const STATUS: Partial<Record<AttemptRefusal, number>> = {
  signed_out: 401,
  rate_limited: 429,
  malformed: 400,
  wrong_item: 400,
  too_large: 413,
  not_found: 404,
  failed: 500,
};

export function refuseSave(refusal: AttemptRefusal): Response {
  const body: SaveRefusalPayload = { refusal, error: ATTEMPT_REFUSALS[refusal] };
  // 409 for the rest: the attempt is not in a state where a save means anything.
  return Response.json(body, { status: STATUS[refusal] ?? 409, headers: NO_STORE });
}

/**
 * The body as text, read no further than `limit` bytes. A Route Handler has no body cap of its
 * own (the Server Action limit does not apply here), and Content-Length is optional and can lie,
 * so the cap is enforced on the bytes as they arrive.
 */
async function readCapped(request: Request, limit: number): Promise<string | "too_large"> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  const whole = new Uint8Array(size);
  chunks.reduce((offset, chunk) => (whole.set(chunk, offset), offset + chunk.byteLength), 0);
  return new TextDecoder().decode(whole);
}

async function readBody(request: Request): Promise<SaveRequestBody | AttemptRefusal> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return "malformed";
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_ITEM_PAYLOAD_BYTES) {
    return "too_large";
  }
  const text = await readCapped(request, MAX_ITEM_PAYLOAD_BYTES);
  if (text === "too_large") return "too_large";
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return "malformed";
  }
  if (!withinItemSizeLimit(body)) return "too_large";
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "malformed";
  const { attemptId, itemId, response } = body as Record<string, unknown>;
  if (typeof attemptId !== "string" || !isUuid(attemptId)) return "malformed";
  if (typeof itemId !== "string" || !isUuid(itemId)) return "malformed";
  return { attemptId, itemId, response };
}

export async function saveAttemptAnswer(request: Request, deps: SaveRouteDeps): Promise<Response> {
  const body = await readBody(request);
  if (typeof body === "string") return refuseSave(body);

  const parsed = responseSchema.safeParse(body.response);
  if (!parsed.success) return refuseSave("malformed");

  const saved = await saveAnswer(
    await deps.client(),
    body.attemptId,
    body.itemId,
    parsed.data as unknown as Json,
  );
  if (!saved.ok) return refuseSave(saved.refusal);
  const payload: SaveAckPayload = { savedAt: saved.value };
  return Response.json(payload, { headers: NO_STORE });
}
