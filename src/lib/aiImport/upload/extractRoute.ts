import { z } from "zod";
import type { RateLimitStore } from "@/lib/rateLimit/store";
import { planExtraction } from "../extract";
import type { ExtractUnitDeps, ExtractUnitRequest, ExtractUnitResult } from "../extractUnit";
import { POSITIONS_PER_FILE } from "../extractUnit";
import type { FileRef } from "../files/store";
import { mergeSegments } from "../merge";
import type { Client } from "./access";
import { admit, answer, fail, type RouteDeps } from "./http";

/**
 * `POST /api/ai-import/extract` (#345): one extract unit of one file, once every chunk of the file
 * has its segments. A case study unit makes several Claude calls and may run a minute, so:
 *
 * - A unit already staged answers at once, with no claim and no call (a reload re-walks every
 *   unit from 0, and this is what makes that cheap).
 * - Otherwise the unit is claimed for `UNIT_CLAIM_MS` in the shared limiter (one hit allowed per
 *   batch, file and unit), so a second tab is told `busy` instead of paying for it twice. A
 *   function killed mid-unit stages nothing (the insert comes last), and its claim lapses, so the
 *   page's next try runs the unit again.
 *
 * The answer is counts only, never a staged question: those hold answer keys.
 */

const bodySchema = z.object({
  batchId: z.uuid(),
  fileId: z.uuid(),
  unit: z.number().int().min(0).max(999),
});

/** Longer than the extract route's 300 s `maxDuration`. */
export const UNIT_CLAIM_MS = 6 * 60 * 1000;

export interface ExtractRouteDeps extends RouteDeps {
  extract: (service: Client, request: ExtractUnitRequest) => Promise<ExtractUnitResult>;
  /** The production wiring's reads, for the already-staged check. */
  unitDeps: (
    service: Client,
  ) => Pick<ExtractUnitDeps, "loadSegments" | "filePlace" | "stagedPlaces">;
  claims: () => RateLimitStore;
}

type UnitState =
  { ok: true; units: number; staged: boolean; questions: number } | { ok: false; code: string };

/** Whether every question of the unit is staged already (a case study: its one entry). */
export async function unitState(
  deps: Pick<ExtractUnitDeps, "loadSegments" | "filePlace" | "stagedPlaces">,
  ref: FileRef,
  unit: number,
): Promise<UnitState> {
  const loaded = await deps.loadSegments(ref);
  if (!loaded.ok) return { ok: false, code: loaded.code };
  const units = planExtraction(mergeSegments(loaded.segments).questions);
  const chosen = units[unit];
  // A file with no questions has no units: there is nothing to extract, and that is not an error.
  if (!chosen && units.length === 0 && unit === 0) {
    return { ok: true, units: 0, staged: true, questions: 0 };
  }
  if (!chosen) return { ok: false, code: "not_found" };
  const place = await deps.filePlace(ref);
  if (place === "unavailable") return { ok: false, code: "unavailable" };
  if (place === null) return { ok: false, code: "not_found" };
  const staged = await deps.stagedPlaces(ref);
  if (staged === "unavailable") return { ok: false, code: "unavailable" };
  const positions = chosen.positions.map((position) => place * POSITIONS_PER_FILE + position);
  const isStaged = (position: number) => staged.positions.has(position);
  const done =
    positions.length > 0 &&
    (chosen.caseStudy !== null ? positions.some(isStaged) : positions.every(isStaged));
  return { ok: true, units: units.length, staged: done, questions: positions.length };
}

export function refusal(result: Extract<ExtractUnitResult, { ok: false }>): Response {
  switch (result.code) {
    case "disabled":
      return fail(404, "not_found");
    case "rate_limited":
      return fail(429, "rate_limited");
    case "cap_reached":
      return fail(402, "cap_reached", { remainingUsd: result.remainingUsd });
    case "claude_failed":
      return fail(502, "claude_failed");
    case "not_found":
      return fail(404, "not_found");
    case "incomplete":
    case "not_uploaded":
    case "changed":
    case "in_progress":
      return fail(409, result.code);
    default:
      return fail(503, "unavailable");
  }
}

function stateRefusal(code: string): Response {
  if (code === "incomplete") return fail(409, "incomplete");
  if (code === "not_found") return fail(404, "not_found");
  return fail(503, "unavailable");
}

export async function extractUnitResponse(
  request: Request,
  deps: ExtractRouteDeps,
): Promise<Response> {
  const admitted = await admit(request, deps, (body) => bodySchema.safeParse(body).data ?? null);
  if (admitted instanceof Response) return admitted;
  const { batchId, fileId, unit } = bodySchema.parse(admitted.body);
  const ref = { orgId: admitted.orgId, batchId, fileId };

  const state = await unitState(deps.unitDeps(admitted.service), ref, unit);
  if (!state.ok) return stateRefusal(state.code);
  if (state.staged) {
    return answer({ units: state.units, staged: 0, alreadyStaged: state.questions, overLimit: 0 });
  }

  let claimed: boolean;
  try {
    claimed = await deps.claims().hit("ai_import_unit", `${batchId}:${fileId}:${unit}`, {
      attempts: 1,
      windowMs: UNIT_CLAIM_MS,
    });
  } catch {
    return fail(503, "unavailable");
  }
  if (!claimed) return fail(409, "busy");

  let result: ExtractUnitResult;
  try {
    result = await deps.extract(admitted.service, { ...ref, unit, userId: admitted.userId });
  } catch {
    return fail(503, "unavailable");
  }
  if (!result.ok) return refusal(result);
  return answer({
    units: result.units,
    staged: result.staged.length,
    alreadyStaged: result.alreadyStaged,
    overLimit: result.overLimit,
  });
}
