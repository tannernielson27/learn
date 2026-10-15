import { z } from "zod";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import type { RateLimitStore } from "@/lib/rateLimit/store";
import type { Client } from "../upload/access";
import { UNIT_CLAIM_MS, refusal } from "../upload/extractRoute";
import { admit, answer, fail, type RouteDeps } from "../upload/http";
import type { RetypeRequest, RetypeResult } from "./retype";

/**
 * `POST /api/ai-import/retype` (#346): change one staged question's type and read it again. A
 * route, not a Server Function, because the read may take a minute and needs the route's own
 * `maxDuration`.
 *
 * Admitted like the parse and extract routes (JSON, a teacher, AI import on, a batch of the
 * session's workspace), but for a batch in review. The entry's version is claimed for
 * `UNIT_CLAIM_MS` in the shared limiter before anything is spent, so a second tab that asks for
 * the same change at once is told `busy` rather than paying for it twice. A successful change
 * moves the version on, so the next change claims afresh; another type is another claim, so a
 * failed read holds only that type for those minutes.
 *
 * The answer is the entry's new version and status, never the question: the page reloads it.
 */

const bodySchema = z.object({
  batchId: z.uuid(),
  entryId: z.uuid(),
  version: z.number().int().min(1).max(2_147_483_647),
  type: z.enum(ITEM_TYPES),
});

export interface RetypeRouteDeps extends RouteDeps {
  retype: (service: Client, request: RetypeRequest) => Promise<RetypeResult>;
  claims: () => RateLimitStore;
}

function refused(result: Extract<RetypeResult, { ok: false }>): Response {
  if (
    result.code === "entry_changed" ||
    result.code === "not_retypable" ||
    result.code === "not_review"
  ) {
    return fail(409, result.code);
  }
  return refusal(
    result as Exclude<typeof result, { code: "entry_changed" | "not_retypable" | "not_review" }>,
  );
}

export async function retypeResponse(request: Request, deps: RetypeRouteDeps): Promise<Response> {
  const admitted = await admit(
    request,
    deps,
    (body) => bodySchema.safeParse(body).data ?? null,
    "review",
  );
  if (admitted instanceof Response) return admitted;
  const { batchId, entryId, version, type } = bodySchema.parse(admitted.body);

  let claimed: boolean;
  try {
    claimed = await deps
      .claims()
      .hit("ai_import_unit", `retype:${batchId}:${entryId}:${version}:${type}`, {
        attempts: 1,
        windowMs: UNIT_CLAIM_MS,
      });
  } catch {
    return fail(503, "unavailable");
  }
  if (!claimed) return fail(409, "retype_busy");

  let result: RetypeResult;
  try {
    result = await deps.retype(admitted.service, {
      orgId: admitted.orgId,
      batchId,
      entryId,
      version,
      type,
      userId: admitted.userId,
    });
  } catch {
    return fail(503, "unavailable");
  }
  if (!result.ok) return refused(result);
  return answer({ version: result.version, status: result.status });
}
