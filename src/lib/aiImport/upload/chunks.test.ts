import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHUNK_STALE_MS, MAX_CHUNK_ATTEMPTS, claimChunk, settleChunk } from "./chunks";
import { BATCH, FILE, ORG, fakeClient } from "./testing/fakeSupabase";

const REF = { orgId: ORG, batchId: BATCH, fileId: FILE };
const NOW = Date.parse("2026-10-15T12:00:00Z");
const row = (status: string, attempts: number, ageMs = 0) => ({
  data: { id: "c1", status, attempts, updated_at: new Date(NOW - ageMs).toISOString() },
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("claimChunk", () => {
  it("claims a failed chunk, guarded by the status and attempts it read", async () => {
    const service = fakeClient({ ai_import_chunks: [row("failed", 2), { data: [{ id: "c1" }] }] });
    expect(await claimChunk(service.client, REF, 3, NOW)).toEqual({ ok: true, attempts: 3 });
    const eqs = service.stepsOn("ai_import_chunks", "eq");
    expect(eqs).toContainEqual(["org_id", ORG]);
    expect(eqs).toContainEqual(["position", 3]);
    expect(eqs).toContainEqual(["status", "failed"]);
    expect(eqs).toContainEqual(["attempts", 2]);
  });

  it("reclaims a chunk left running past the stale time, and not before", async () => {
    const fresh = fakeClient({ ai_import_chunks: [row("running", 1, CHUNK_STALE_MS - 1000)] });
    expect(await claimChunk(fresh.client, REF, 0, NOW)).toEqual({ ok: false, code: "busy" });
    const stale = fakeClient({
      ai_import_chunks: [row("running", 1, CHUNK_STALE_MS), { data: [{ id: "c1" }] }],
    });
    expect(await claimChunk(stale.client, REF, 0, NOW)).toEqual({ ok: true, attempts: 2 });
  });

  it("stops after the last try, and says done or not found", async () => {
    const spent = fakeClient({ ai_import_chunks: [row("failed", MAX_CHUNK_ATTEMPTS)] });
    expect(await claimChunk(spent.client, REF, 0, NOW)).toEqual({ ok: false, code: "spent" });
    const done = fakeClient({ ai_import_chunks: [row("done", 1)] });
    expect(await claimChunk(done.client, REF, 0, NOW)).toEqual({ ok: false, code: "done" });
    const none = fakeClient({ ai_import_chunks: [{ data: null }] });
    expect(await claimChunk(none.client, REF, 0, NOW)).toEqual({ ok: false, code: "not_found" });
  });

  it("answers unavailable when either query fails", async () => {
    const read = fakeClient({ ai_import_chunks: [{ error: { code: "X" } }] });
    expect(await claimChunk(read.client, REF, 0, NOW)).toEqual({ ok: false, code: "unavailable" });
    const write = fakeClient({ ai_import_chunks: [row("pending", 0), { error: { code: "X" } }] });
    expect(await claimChunk(write.client, REF, 0, NOW)).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});

describe("settleChunk", () => {
  it("changes only the claim that is still current", async () => {
    const service = fakeClient({ ai_import_chunks: [{ data: null }] });
    await settleChunk(service.client, REF, 0, 2, { status: "released" });
    expect(service.stepsOn("ai_import_chunks", "update")).toEqual([
      [{ status: "pending", attempts: 1 }],
    ]);
    const eqs = service.stepsOn("ai_import_chunks", "eq");
    expect(eqs).toContainEqual(["status", "running"]);
    expect(eqs).toContainEqual(["attempts", 2]);
  });

  it("logs a failed write by its code", async () => {
    const service = fakeClient({ ai_import_chunks: [{ error: { code: "57014" } }] });
    await settleChunk(service.client, REF, 0, 1, { status: "failed", code: "bad_answer" });
    expect(errorSpy).toHaveBeenCalledWith("[ai-import] recording a chunk failed", {
      code: "57014",
    });
  });
});
