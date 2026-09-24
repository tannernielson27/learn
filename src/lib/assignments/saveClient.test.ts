import { describe, expect, it, vi } from "vitest";
import { ATTEMPT_SAVE_ROUTE, postAttemptAnswer } from "./saveClient";
import { SAVE_ROUTE } from "./saveRoute";

const ATTEMPT = "00000000-0000-0000-0000-0000000000a1";
const ITEM = "00000000-0000-0000-0000-0000000000f1";
const ANSWER = { type: "multiple_choice", optionId: "opt_a" };

describe("postAttemptAnswer", () => {
  it("posts JSON to the route the handler serves", async () => {
    expect(ATTEMPT_SAVE_ROUTE).toBe(SAVE_ROUTE);
    const send = vi.fn(async () => Response.json({ savedAt: "2026-09-23T12:00:00Z" }));
    expect(await postAttemptAnswer(ATTEMPT, ITEM, ANSWER, send)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith(
      ATTEMPT_SAVE_ROUTE,
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId: ATTEMPT, itemId: ITEM, response: ANSWER }),
      }),
    );
  });

  it("marks a refusal no retry can fix as final, and the rest as retryable", async () => {
    const closed = vi.fn(async () =>
      Response.json({ refusal: "closed", error: "x" }, { status: 409 }),
    );
    expect(await postAttemptAnswer(ATTEMPT, ITEM, ANSWER, closed)).toEqual({
      ok: false,
      refusal: "closed",
      final: true,
    });
    const busy = vi.fn(async () =>
      Response.json({ refusal: "rate_limited", error: "x" }, { status: 429 }),
    );
    expect(await postAttemptAnswer(ATTEMPT, ITEM, ANSWER, busy)).toEqual({
      ok: false,
      refusal: "rate_limited",
      final: false,
    });
  });

  it("retries a network failure or an unreadable error", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await postAttemptAnswer(ATTEMPT, ITEM, ANSWER, offline)).toEqual({
      ok: false,
      refusal: "failed",
      final: false,
    });
    const html = vi.fn(async () => new Response("<html>", { status: 502 }));
    expect(await postAttemptAnswer(ATTEMPT, ITEM, ANSWER, html)).toEqual({
      ok: false,
      refusal: "failed",
      final: false,
    });
  });
});
