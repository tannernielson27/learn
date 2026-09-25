import { describe, expect, it, vi } from "vitest";
import { PracticeAnswerError, postPracticeAnswer } from "./answerClient";

const RUN = "00000000-0000-4000-8000-0000000000a1";
const ITEM = "00000000-0000-4000-8000-0000000000f1";
const ANSWER = { type: "multiple_choice" as const, optionId: "opt_a" };
const REVEAL = {
  score: { model: "zero_one", maxPoints: 1, points: 1, breakdown: [] },
  answerKey: { correctOptionId: "opt_a" },
  rationale: {},
  scoring: { model: "zero_one", maxPoints: 1 },
};

const replying = (status: number, body: unknown) =>
  vi.fn(
    async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );

async function refusalFrom(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PracticeAnswerError) return error.refusal;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("postPracticeAnswer", () => {
  it("posts the run, the item and the answer as JSON, and resolves with the reveal", async () => {
    const send = replying(200, REVEAL);
    await expect(postPracticeAnswer(RUN, ITEM, ANSWER, send)).resolves.toEqual(REVEAL);
    expect(send).toHaveBeenCalledWith("/api/practice/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: RUN, itemId: ITEM, response: ANSWER }),
      cache: "no-store",
    });
  });

  it("rejects with the route's refusal", async () => {
    const send = replying(409, { refusal: "answered", error: "…" });
    expect(await refusalFrom(postPracticeAnswer(RUN, ITEM, ANSWER, send))).toBe("answered");
  });

  it.each([
    ["an unknown refusal", replying(418, { refusal: "teapot" })],
    ["a body that is not JSON", replying(500, "<html>")],
    ["a reply that is not a reveal", replying(200, { score: { points: 1 } })],
    ["a reply that is not JSON", replying(200, "ok")],
    [
      "a network failure",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    ],
  ])("rejects %s as failed", async (_name, send) => {
    expect(await refusalFrom(postPracticeAnswer(RUN, ITEM, ANSWER, send))).toBe("failed");
  });
});
