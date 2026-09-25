/**
 * The browser's half of a practice answer (#241): one answer to `POST /api/practice/answer`, and
 * that item's reveal back. Holds no key and no scoring code; a student's screen imports it. The
 * route's own half is `answerRoute.ts`, which a browser must never import.
 */
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { ScoreReveal } from "@/lib/ngn/submit";
import { PRACTICE_ANSWER_ROUTE, isPracticeRefusal, type PracticeRefusal } from "./refusals";

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** The route said no, or could not be reached (`failed`). */
export class PracticeAnswerError extends Error {
  readonly refusal: PracticeRefusal;
  constructor(refusal: PracticeRefusal) {
    super(`the practice answer was refused (${refusal})`);
    this.name = "PracticeAnswerError";
    this.refusal = refusal;
  }
}

async function refusalOf(response: Response): Promise<PracticeRefusal> {
  try {
    const body = (await response.json()) as { refusal?: unknown };
    return isPracticeRefusal(body.refusal) ? body.refusal : "failed";
  } catch {
    return "failed";
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Just enough of a reveal to render one: a score with numbers, and a key beside it. */
function isReveal(value: unknown): value is ScoreReveal {
  if (!isObject(value) || !isObject(value.score)) return false;
  return (
    typeof value.score.points === "number" &&
    typeof value.score.maxPoints === "number" &&
    isObject(value.answerKey) &&
    isObject(value.rationale) &&
    isObject(value.scoring)
  );
}

/** Sends one answer and resolves with its reveal, or rejects with a `PracticeAnswerError`. */
export async function postPracticeAnswer(
  runId: string,
  itemId: string,
  response: AnyResponse,
  send: Fetch = (input, init) => fetch(input, init),
): Promise<ScoreReveal> {
  let reply: Response;
  try {
    reply = await send(PRACTICE_ANSWER_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, itemId, response }),
      cache: "no-store",
    });
  } catch {
    throw new PracticeAnswerError("failed");
  }
  if (!reply.ok) throw new PracticeAnswerError(await refusalOf(reply));
  let body: unknown;
  try {
    body = await reply.json();
  } catch {
    throw new PracticeAnswerError("failed");
  }
  if (!isReveal(body)) throw new PracticeAnswerError("failed");
  return body;
}
