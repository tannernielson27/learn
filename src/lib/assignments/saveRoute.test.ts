import { describe, expect, it, vi } from "vitest";
import { saveAttemptAnswer, type SaveRouteDeps } from "./saveRoute";

const ATTEMPT = "00000000-0000-0000-0000-0000000000a1";
const ITEM = "00000000-0000-0000-0000-0000000000f1";
const ANSWER = { type: "multiple_choice", optionId: "opt_a" };

type RpcReply = { data: unknown; error: { code?: string } | null };

function deps(reply: RpcReply) {
  const rpc = vi.fn(async () => reply);
  const client = { rpc } as unknown as Awaited<ReturnType<SaveRouteDeps["client"]>>;
  return { deps: { client: async () => client } satisfies SaveRouteDeps, rpc };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/assignments/save", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const SAVED = { data: [{ refusal: null, saved_at: "2026-09-23T12:00:00Z" }], error: null };

describe("POST /api/assignments/save", () => {
  it("saves one answer as the signed-in student and answers with when, and nothing else", async () => {
    const fake = deps(SAVED);
    const response = await saveAttemptAnswer(
      post({ attemptId: ATTEMPT, itemId: ITEM, response: ANSWER }),
      fake.deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ savedAt: "2026-09-23T12:00:00Z" });
    expect(fake.rpc).toHaveBeenCalledWith("save_attempt_response", {
      target_attempt: ATTEMPT,
      target_item: ITEM,
      answer: ANSWER,
    });
  });

  it("refuses anything that is not JSON, before reading it", async () => {
    const fake = deps(SAVED);
    const response = await saveAttemptAnswer(
      post("attemptId=x", { "content-type": "application/x-www-form-urlencoded" }),
      fake.deps,
    );
    expect(response.status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["broken JSON", "{"],
    ["a list", [1, 2]],
    ["no attempt", { itemId: ITEM, response: ANSWER }],
    ["an attempt that is not a uuid", { attemptId: "../x", itemId: ITEM, response: ANSWER }],
    ["an item that is not a uuid", { attemptId: ATTEMPT, itemId: "mc_1", response: ANSWER }],
    [
      "a response of no known shape",
      { attemptId: ATTEMPT, itemId: ITEM, response: { type: "nope" } },
    ],
  ])("refuses %s as malformed without calling the database", async (_name, body) => {
    const fake = deps(SAVED);
    const response = await saveAttemptAnswer(post(body), fake.deps);
    expect(response.status).toBe(400);
    expect((await response.json()).refusal).toBe("malformed");
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("refuses a body declared too large before reading it", async () => {
    const fake = deps(SAVED);
    const response = await saveAttemptAnswer(
      post({ attemptId: ATTEMPT, itemId: ITEM, response: ANSWER }, { "content-length": "300000" }),
      fake.deps,
    );
    expect(response.status).toBe(413);
  });

  it("stops reading a body that never declared its length once it passes the cap", async () => {
    const fake = deps(SAVED);
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        // Far more than the cap if read to the end; a reader that stops early pulls a few chunks.
        if (sent >= 64) return controller.close();
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const request = new Request("http://localhost/api/assignments/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const response = await saveAttemptAnswer(request, fake.deps);
    expect(response.status).toBe(413);
    expect(sent).toBeLessThan(10);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["closed", 409],
    ["already_submitted", 409],
    ["not_found", 404],
    ["rate_limited", 429],
    ["wrong_item", 400],
    ["surprising_new_code", 500],
  ])("carries the database's %s refusal as %i", async (refusal, status) => {
    const fake = deps({ data: [{ refusal, saved_at: null }], error: null });
    const response = await saveAttemptAnswer(
      post({ attemptId: ATTEMPT, itemId: ITEM, response: ANSWER }),
      fake.deps,
    );
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error).toMatch(/\.$/);
  });

  it("says signed out when the function finds no user, and failed on any other error", async () => {
    const out = deps({ data: null, error: { code: "42501" } });
    const signedOut = await saveAttemptAnswer(
      post({ attemptId: ATTEMPT, itemId: ITEM, response: ANSWER }),
      out.deps,
    );
    expect(signedOut.status).toBe(401);

    const broken = deps({ data: null, error: { code: "XX000" } });
    const failed = await saveAttemptAnswer(
      post({ attemptId: ATTEMPT, itemId: ITEM, response: ANSWER }),
      broken.deps,
    );
    expect(failed.status).toBe(500);

    const empty = deps({ data: [], error: null });
    const nothing = await saveAttemptAnswer(
      post({ attemptId: ATTEMPT, itemId: ITEM, response: ANSWER }),
      empty.deps,
    );
    expect(nothing.status).toBe(500);
  });
});
