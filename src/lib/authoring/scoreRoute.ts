import { NextResponse } from "next/server";
import { isUuid } from "@/lib/authoring/ids";
import { MAX_ITEM_PAYLOAD_BYTES, withinItemSizeLimit } from "@/lib/authoring/payloadSize";
import {
  parseScoreRequest,
  SCORE_REQUEST_ERRORS,
  scoreForReveal,
} from "@/lib/authoring/scoreRequest";
import { authorForRoute } from "@/lib/authoring/session";
import { fromItemRow } from "@/lib/supabase/itemRows";

const NO_STORE = { "Cache-Control": "no-store" };

export const SCORE_ROUTE_ERRORS = {
  notFound: "This item could not be found.",
  signedOut: "Sign in to play this item.",
  forbidden: "You do not have access to this item.",
  tooLarge: "That answer is too large to check.",
  unplayable: "This item has a problem and cannot be played. Open it in the editor.",
  failed: "The answer could not be checked. Try again.",
} as const;

function fail(status: number, error: string): Response {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * Scores a response to a published item on the server (ADR 0003). The browser only ever held the
 * keyless item; the key is read here, under the caller's RLS, and returned only with the score.
 * Another org's item and an unpublished item both read as not found, so neither leaks existence.
 */
export async function scoreResponse(request: Request, itemId: string): Promise<Response> {
  if (!isUuid(itemId)) return fail(404, SCORE_ROUTE_ERRORS.notFound);

  // JSON only: a cross-site form post (text/plain, urlencoded) cannot reach the scorer.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return fail(415, SCORE_REQUEST_ERRORS.malformed);
  }

  const author = await authorForRoute();
  if (author.status === "signed_out") return fail(401, SCORE_ROUTE_ERRORS.signedOut);
  if (author.status === "forbidden") return fail(403, SCORE_ROUTE_ERRORS.forbidden);

  // A declared oversized body is refused before it is read; the parsed check below catches the rest.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_ITEM_PAYLOAD_BYTES) {
    return fail(413, SCORE_ROUTE_ERRORS.tooLarge);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, SCORE_REQUEST_ERRORS.malformed);
  }
  if (!withinItemSizeLimit(body)) return fail(413, SCORE_ROUTE_ERRORS.tooLarge);

  const { data: row, error } = await author.supabase
    .from("items")
    .select("type, cjmm_step, tags, version, status, content, answer_key, rationale, scoring")
    .eq("id", itemId)
    .maybeSingle();
  if (error) return fail(500, SCORE_ROUTE_ERRORS.failed);
  if (!row || row.status !== "published") return fail(404, SCORE_ROUTE_ERRORS.notFound);

  // Stored JSON is external input: validate the whole item before scoring against it.
  const stored = fromItemRow(row);
  if (!stored.ok) return fail(409, SCORE_ROUTE_ERRORS.unplayable);

  const parsed = parseScoreRequest(body, stored.value.type);
  if (!parsed.ok) return fail(parsed.status, parsed.error);

  return NextResponse.json(scoreForReveal(stored.value, parsed.response), { headers: NO_STORE });
}
