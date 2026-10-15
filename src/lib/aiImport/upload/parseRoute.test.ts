import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteAuthor } from "@/lib/authoring/session";
import type { SegmentChunkResult } from "../segmentChunk";
import { parseChunkResponse, type ParseRouteDeps } from "./parseRoute";
import {
  BATCH,
  FILE,
  OFF,
  ON,
  ORG,
  OTHER_ORG,
  USER,
  fakeClient,
  teacher,
  type Reply,
} from "./testing/fakeSupabase";

const USAGE = { inputTokens: 100, outputTokens: 20, cacheWriteTokens: 0, cacheReadTokens: 0 };
const parsing: Reply = { data: { id: BATCH, status: "parsing", bank_id: null } };
const pendingChunk: Reply = {
  data: { id: "c1", status: "pending", attempts: 0, updated_at: new Date().toISOString() },
};

const ok: SegmentChunkResult = {
  ok: true,
  segment: {
    position: 0,
    pageFrom: null,
    pageTo: null,
    questions: [{} as never, {} as never],
    answers: [],
    droppedAnswers: 0,
    source: { author: null, objectives: [], references: [] },
  },
  usage: USAGE,
  costUsd: 0.0004,
  attempts: 1,
  remainingUsd: 9,
  remainingPages: null,
};

function post(body: unknown, contentType = "application/json") {
  return new Request("https://learn.example/api/ai-import/parse", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const BODY = { batchId: BATCH, fileId: FILE, position: 0 };

function setup({
  author = teacher().author,
  batch = [parsing],
  chunks = [pendingChunk, { data: [{ id: "c1" }] }, { data: null }],
  result = ok,
  env = ON,
}: {
  author?: RouteAuthor;
  batch?: Reply[];
  chunks?: Reply[];
  result?: SegmentChunkResult;
  env?: Record<string, string>;
} = {}) {
  const service = fakeClient({ ai_import_batches: batch, ai_import_chunks: chunks });
  const segment = vi.fn(async () => result);
  const deps: ParseRouteDeps = {
    author: async () => author,
    env,
    service: () => service.client,
    segment,
  };
  return { deps, service, segment };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("POST /api/ai-import/parse", () => {
  it("claims the chunk, reads it with the session's workspace and user, and records it done", async () => {
    const { deps, service, segment } = setup();
    const response = await parseChunkResponse(post(BODY), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, questions: 2, already: false });
    expect(segment).toHaveBeenCalledWith(service.client, {
      orgId: ORG,
      batchId: BATCH,
      fileId: FILE,
      position: 0,
      userId: USER,
    });
    // The batch is read in the caller's workspace.
    expect(service.stepsOn("ai_import_batches", "eq")).toContainEqual(["org_id", ORG]);
    // Claimed: pending to running, guarded by the status and attempts just read.
    const [claim, done] = service.stepsOn("ai_import_chunks", "update");
    expect(claim?.[0]).toMatchObject({ status: "running", attempts: 1 });
    expect(done?.[0]).toMatchObject({ status: "done", input_tokens: 100, output_tokens: 20 });
    expect(service.left()).toEqual([]);
  });

  it("refuses a signed-out visitor with 401 and calls nothing", async () => {
    const { deps, segment } = setup({ author: { status: "signed_out" } });
    const response = await parseChunkResponse(post(BODY), deps);
    expect(response.status).toBe(401);
    expect(segment).not.toHaveBeenCalled();
  });

  it("refuses a student with 403 and calls nothing", async () => {
    const { deps, segment } = setup({ author: { status: "forbidden", role: "student" } });
    const response = await parseChunkResponse(post(BODY), deps);
    expect(response.status).toBe(403);
    expect(segment).not.toHaveBeenCalled();
  });

  it("answers 404 for another workspace's batch, which the workspace filter does not find", async () => {
    const other = teacher();
    (other.author as { orgId: string }).orgId = OTHER_ORG;
    const { deps, service, segment } = setup({ author: other.author, batch: [{ data: null }] });
    const response = await parseChunkResponse(post(BODY), deps);
    expect(response.status).toBe(404);
    expect(service.stepsOn("ai_import_batches", "eq")).toContainEqual(["org_id", OTHER_ORG]);
    expect(segment).not.toHaveBeenCalled();
  });

  it("answers 404 when AI import is off for the deployment", async () => {
    const { deps, segment } = setup({ env: OFF });
    expect((await parseChunkResponse(post(BODY), deps)).status).toBe(404);
    expect(segment).not.toHaveBeenCalled();
  });

  it("answers 404 when AI import is off for the workspace", async () => {
    const { deps, segment } = setup({ author: teacher(false).author });
    expect((await parseChunkResponse(post(BODY), deps)).status).toBe(404);
    expect(segment).not.toHaveBeenCalled();
  });

  it("answers 429 over the hourly limit and gives the try back", async () => {
    const { deps, service } = setup({ result: { ok: false, code: "rate_limited" } });
    const response = await parseChunkResponse(post(BODY), deps);
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("rate_limited");
    const [, released] = service.stepsOn("ai_import_chunks", "update");
    expect(released?.[0]).toEqual({ status: "pending", attempts: 0 });
  });

  it("answers 402 with what is left when the cap is reached, and gives the try back", async () => {
    const { deps, service } = setup({
      result: { ok: false, code: "cap_reached", remainingUsd: 0.01, remainingPages: null },
    });
    const response = await parseChunkResponse(post(BODY), deps);
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "cap_reached", remainingUsd: 0.01 });
    const [, released] = service.stepsOn("ai_import_chunks", "update");
    expect(released?.[0]).toMatchObject({ status: "pending" });
  });

  it("answers 502 when Claude fails and records the chunk failed with a code only", async () => {
    const { deps, service } = setup({
      result: { ok: false, code: "claude_failed", reason: "overloaded" },
    });
    const response = await parseChunkResponse(post(BODY), deps);
    expect(response.status).toBe(502);
    expect((await response.json()).message).toMatch(/nothing was charged/);
    const [, failed] = service.stepsOn("ai_import_chunks", "update");
    expect(failed?.[0]).toEqual({ status: "failed", last_error: "claude_failed" });
  });

  it("answers 409 busy while another request holds the chunk, without calling Claude", async () => {
    const running: Reply = {
      data: { id: "c1", status: "running", attempts: 1, updated_at: new Date().toISOString() },
    };
    const { deps, segment } = setup({ chunks: [running] });
    const response = await parseChunkResponse(post(BODY), deps);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("busy");
    expect(segment).not.toHaveBeenCalled();
  });

  it("answers 409 busy when another request claimed it between the read and the update", async () => {
    const { deps, segment } = setup({ chunks: [pendingChunk, { data: [] }] });
    expect((await parseChunkResponse(post(BODY), deps)).status).toBe(409);
    expect(segment).not.toHaveBeenCalled();
  });

  it("answers done at once for a chunk read already", async () => {
    const done: Reply = {
      data: { id: "c1", status: "done", attempts: 1, updated_at: new Date().toISOString() },
    };
    const { deps, segment } = setup({ chunks: [done] });
    const response = await parseChunkResponse(post(BODY), deps);
    expect(await response.json()).toEqual({ ok: true, questions: 0, already: true });
    expect(segment).not.toHaveBeenCalled();
  });

  it("refuses a batch that is not reading files", async () => {
    const { deps } = setup({ batch: [{ data: { id: BATCH, status: "review", bank_id: null } }] });
    expect((await parseChunkResponse(post(BODY), deps)).status).toBe(409);
  });

  it.each([
    ["not JSON", "{", "application/json", 400],
    ["a bad id", JSON.stringify({ ...BODY, batchId: "x" }), "application/json", 400],
    ["a form post", JSON.stringify(BODY), "text/plain", 415],
    ["a large body", JSON.stringify({ ...BODY, pad: "x".repeat(2000) }), "application/json", 413],
  ])("refuses %s", async (_name, body, type, status) => {
    const { deps, segment } = setup();
    expect((await parseChunkResponse(post(body, type), deps)).status).toBe(status);
    expect(segment).not.toHaveBeenCalled();
  });

  it("records a failure when the segment pass throws", async () => {
    const { deps, service, segment } = setup();
    segment.mockRejectedValueOnce(new Error("boom"));
    expect((await parseChunkResponse(post(BODY), deps)).status).toBe(503);
    const [, failed] = service.stepsOn("ai_import_chunks", "update");
    expect(failed?.[0]).toMatchObject({ status: "failed" });
  });
});
