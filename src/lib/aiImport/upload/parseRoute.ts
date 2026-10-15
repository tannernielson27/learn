import { z } from "zod";
import type { SegmentChunkRequest, SegmentChunkResult } from "../segmentChunk";
import type { Client } from "./access";
import { claimChunk, settleChunk, type ChunkClaim } from "./chunks";
import { admit, answer, fail, type RouteDeps } from "./http";

/**
 * `POST /api/ai-import/parse` (#345): one chunk through the segment pass, as the page asks for it
 * two or three at a time. The chunk is claimed first (`claimChunk`), then `segmentChunk` checks
 * the per-teacher limit, the file's hash and the cap, and calls Claude. Its answer is stored by
 * `segmentChunk`; the page is told only how many questions it found.
 */

const bodySchema = z.object({
  batchId: z.uuid(),
  fileId: z.uuid(),
  position: z.number().int().min(0).max(999),
});

export interface ParseRouteDeps extends RouteDeps {
  segment: (service: Client, request: SegmentChunkRequest) => Promise<SegmentChunkResult>;
  claim?: typeof claimChunk;
  now?: () => number;
}

type Refusal = Extract<SegmentChunkResult, { ok: false }>;

/** Refusals made before anything was sent: the try is given back. */
const RELEASED = new Set(["disabled", "rate_limited", "cap_reached"]);

function refusal(result: Refusal): Response {
  switch (result.code) {
    case "disabled":
      return fail(404, "not_found");
    case "rate_limited":
      return fail(429, "rate_limited");
    case "cap_reached":
      return fail(402, "cap_reached", { remainingUsd: result.remainingUsd });
    case "claude_failed":
      return fail(502, "claude_failed");
    case "bad_answer":
      return fail(502, "bad_answer");
    case "not_found":
      return fail(404, "not_found");
    case "not_uploaded":
    case "changed":
    case "in_progress":
      return fail(409, result.code);
    default:
      return fail(503, "unavailable");
  }
}

function claimRefusal(claim: Extract<ChunkClaim, { ok: false }>): Response {
  if (claim.code === "done") return answer({ questions: 0, already: true });
  if (claim.code === "not_found") return fail(404, "not_found");
  if (claim.code === "unavailable") return fail(503, "unavailable");
  return fail(409, claim.code);
}

export async function parseChunkResponse(
  request: Request,
  deps: ParseRouteDeps,
): Promise<Response> {
  const admitted = await admit(request, deps, (body) => bodySchema.safeParse(body).data ?? null);
  if (admitted instanceof Response) return admitted;
  const { batchId, fileId, position } = bodySchema.parse(admitted.body);
  const ref = { orgId: admitted.orgId, batchId, fileId };

  const claim = await (deps.claim ?? claimChunk)(
    admitted.service,
    ref,
    position,
    deps.now?.() ?? Date.now(),
  );
  if (!claim.ok) return claimRefusal(claim);

  let result: SegmentChunkResult;
  try {
    result = await deps.segment(admitted.service, { ...ref, position, userId: admitted.userId });
  } catch {
    await settleChunk(admitted.service, ref, position, claim.attempts, {
      status: "failed",
      code: "unavailable",
    });
    return fail(503, "unavailable");
  }
  if (result.ok) {
    await settleChunk(admitted.service, ref, position, claim.attempts, {
      status: "done",
      usage: result.usage,
    });
    return answer({ questions: result.segment.questions.length, already: false });
  }
  await settleChunk(
    admitted.service,
    ref,
    position,
    claim.attempts,
    RELEASED.has(result.code) ? { status: "released" } : { status: "failed", code: result.code },
  );
  return refusal(result);
}
