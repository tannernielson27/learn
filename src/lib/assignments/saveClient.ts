/**
 * The browser's half of autosave (#208): one answer to `POST /api/assignments/save`, read back as
 * a `SaveResult` the autosaver understands. Holds no key and no scoring; a student's screen imports
 * it. The route's own half is `saveRoute.ts`, which a browser must never import.
 */
import { FINAL_REFUSALS, asAttemptRefusal, type AttemptRefusal } from "./attemptRefusals";
import type { SaveResult } from "./autosave";

export const ATTEMPT_SAVE_ROUTE = "/api/assignments/save";

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

async function refusalOf(response: Response): Promise<AttemptRefusal> {
  try {
    const body = (await response.json()) as { refusal?: unknown };
    return asAttemptRefusal(body.refusal) ?? "failed";
  } catch {
    return "failed";
  }
}

/** Saves one answer. A network failure is a retry, never a thrown error. */
export async function postAttemptAnswer(
  attemptId: string,
  itemId: string,
  response: unknown,
  send: Fetch = (input, init) => fetch(input, init),
): Promise<SaveResult> {
  let reply: Response;
  try {
    reply = await send(ATTEMPT_SAVE_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attemptId, itemId, response }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, refusal: "failed", final: false };
  }
  if (reply.ok) return { ok: true };
  const refusal = await refusalOf(reply);
  return { ok: false, refusal, final: FINAL_REFUSALS.has(refusal) };
}
