import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteAuthor } from "@/lib/authoring/session";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import {
  BATCH,
  OFF,
  ON,
  ORG,
  USER,
  fakeClient,
  teacher,
  type Reply,
} from "../upload/testing/fakeSupabase";
import type { RetypeResult } from "./retype";
import { retypeResponse, type RetypeRouteDeps } from "./retypeRoute";

const ENTRY = "00000000-0000-4000-8000-0000000000e1";
const BODY = { batchId: BATCH, entryId: ENTRY, version: 2, type: "bowtie" };
const review: Reply = { data: { id: BATCH, status: "review", bank_id: null } };

const ok: RetypeResult = {
  ok: true,
  version: 3,
  status: "ready",
  usage: { inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0 },
  costUsd: 0.001,
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://learn.example/api/ai-import/retype", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function setup({
  author = teacher().author,
  batch = [review],
  result = ok as RetypeResult | Error,
  env = ON,
  claims = createMemoryRateLimitStore(),
}: {
  author?: RouteAuthor;
  batch?: Reply[];
  result?: RetypeResult | Error;
  env?: Record<string, string>;
  claims?: ReturnType<typeof createMemoryRateLimitStore>;
} = {}) {
  const service = fakeClient({ ai_import_batches: batch });
  const retype = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const deps: RetypeRouteDeps = {
    author: async () => author,
    env,
    service: () => service.client,
    retype,
    claims: () => claims,
  };
  return { deps, service, retype, claims };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("POST /api/ai-import/retype", () => {
  it("claims the entry's version, reads it again as the session's teacher, and answers no question", async () => {
    const { deps, service, retype, claims } = setup();
    const response = await retypeResponse(post(BODY), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: 3, status: "ready" });
    expect(retype).toHaveBeenCalledWith(service.client, {
      orgId: ORG,
      batchId: BATCH,
      entryId: ENTRY,
      version: 2,
      type: "bowtie",
      userId: USER,
    });
    expect(claims.hits()).toEqual([
      { bucket: "ai_import_unit", key: `retype:${BATCH}:${ENTRY}:2` },
    ]);
    expect(service.stepsOn("ai_import_batches", "eq")).toContainEqual(["org_id", ORG]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("tells a second tab asking for the same change that it is busy, and spends nothing", async () => {
    const claims = createMemoryRateLimitStore();
    await retypeResponse(post(BODY), setup({ claims }).deps);
    const second = setup({ claims });
    const response = await retypeResponse(post(BODY), second.deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "busy" });
    expect(second.retype).not.toHaveBeenCalled();
  });

  it("is only for a batch in review", async () => {
    const { deps, retype } = setup({
      batch: [{ data: { id: BATCH, status: "parsing", bank_id: null } }],
    });
    const response = await retypeResponse(post(BODY), deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "not_review" });
    expect(retype).not.toHaveBeenCalled();
  });

  it.each([
    ["anon", { author: { status: "signed_out" } as RouteAuthor }, 401],
    ["a student", { author: { status: "forbidden", role: "student" } as RouteAuthor }, 403],
    ["AI import off", { env: OFF }, 404],
    ["another workspace's batch", { batch: [{ data: null }] }, 404],
  ])("refuses %s", async (_name, options, status) => {
    const { deps, retype } = setup(options);
    expect((await retypeResponse(post(BODY), deps)).status).toBe(status);
    expect(retype).not.toHaveBeenCalled();
  });

  it("refuses a type that is not an NGN type, or a body that is not JSON", async () => {
    const { deps, retype } = setup();
    expect((await retypeResponse(post({ ...BODY, type: "matching" }), deps)).status).toBe(400);
    const form = new Request("https://learn.example/api/ai-import/retype", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "a=1",
    });
    expect((await retypeResponse(form, deps)).status).toBe(415);
    expect(retype).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, code: "entry_changed" } as RetypeResult, 409, "entry_changed"],
    [{ ok: false, code: "not_retypable" } as RetypeResult, 409, "not_retypable"],
    [
      { ok: false, code: "cap_reached", remainingUsd: 0, remainingPages: null } as RetypeResult,
      402,
      "cap_reached",
    ],
    [
      { ok: false, code: "claude_failed", reason: "overloaded" } as RetypeResult,
      502,
      "claude_failed",
    ],
    [{ ok: false, code: "not_found" } as RetypeResult, 404, "not_found"],
  ])("answers %o with %i", async (result, status, code) => {
    const response = await retypeResponse(post(BODY), setup({ result }).deps);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ ok: false, code });
  });

  it("answers unavailable when the claim or the work throws", async () => {
    const thrown = await retypeResponse(post(BODY), setup({ result: new Error("boom") }).deps);
    expect(thrown.status).toBe(503);
    const broken = setup();
    broken.deps.claims = () => ({
      hit: async () => {
        throw new Error("down");
      },
    });
    expect((await retypeResponse(post(BODY), broken.deps)).status).toBe(503);
  });
});
