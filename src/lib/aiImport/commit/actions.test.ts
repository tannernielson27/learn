import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteAuthor } from "@/lib/authoring/session";
import { FIXTURES } from "@/lib/ngn/fixtures";
import type { Client } from "../upload/access";
import {
  BATCH,
  BANK,
  OFF,
  ON,
  ORG,
  fakeClient,
  teacher,
  type Reply,
} from "../upload/testing/fakeSupabase";
import { discardBatch, importBatch, type CommitDeps } from "./actions";

const ENTRY = "00000000-0000-4000-8000-0000000000e1";
const PATH = `${ORG}/${BATCH}/00000000-0000-4000-8000-0000000000f1`;

const entry = (over: Record<string, unknown> = {}) => ({
  id: ENTRY,
  version: 3,
  position: 0,
  kind: "item",
  status: "ready",
  item: FIXTURES.multiple_choice.canonical,
  ...over,
});
const reviewBatch: Reply = { data: { status: "review", bank_id: BANK } };

function service(queue: Reply[] = [{ data: [{ storage_path: PATH }] }, { data: null }]) {
  const fake = fakeClient({ ai_import_object_deletes: queue });
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const client = {
    ...fake.client,
    from: fake.from,
    storage: { from: vi.fn(() => ({ remove })) },
  } as unknown as Client;
  return { fake, client, remove };
}

function withRpc(author: RouteAuthor, reply: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn(async () => ({ data: null, error: null, ...reply }));
  if (author.status === "ok") Object.assign(author.supabase, { rpc });
  return rpc;
}

function deps(author: RouteAuthor, store = service(), env: Record<string, string> = ON) {
  const value: CommitDeps = { author: async () => author, env, service: () => store.client };
  return value;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("importBatch", () => {
  it("validates the kept entries, imports them as the teacher, then removes the files", async () => {
    const { author, session } = teacher(true, {
      ai_import_batches: [reviewBatch],
      ai_import_entries: [{ data: [entry(), entry({ id: "x", status: "dropped", item: null })] }],
    });
    const rpc = withRpc(author, { data: { ok: true, questions: 1, case_studies: 0 } });
    const store = service();
    const result = await importBatch(deps(author, store), { batchId: BATCH });

    expect(result).toEqual({ ok: true, questions: 1, caseStudies: 0, bankId: BANK });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as unknown as [
      string,
      { p_batch: string; p_entries: { id: string; version: number }[] },
    ];
    expect(name).toBe("import_ai_batch");
    expect(args.p_batch).toBe(BATCH);
    expect(args.p_entries.map(({ id, version }) => ({ id, version }))).toEqual([
      { id: ENTRY, version: 3 },
    ]);
    // Every read is pinned to the session's workspace.
    expect(session.stepsOn("ai_import_entries", "eq")).toContainEqual(["org_id", ORG]);
    expect(session.stepsOn("ai_import_batches", "eq")).toContainEqual(["org_id", ORG]);
    expect(store.remove).toHaveBeenCalledWith([PATH]);
    expect(store.fake.stepsOn("ai_import_object_deletes", "eq")).toEqual([
      ["org_id", ORG],
      ["org_id", ORG],
    ]);
  });

  it("refuses a kept entry that needs an answer before calling the database", async () => {
    const { author } = teacher(true, {
      ai_import_batches: [reviewBatch],
      ai_import_entries: [{ data: [entry(), entry({ id: "y", status: "needs_answer" })] }],
    });
    const rpc = withRpc(author, {});
    const result = await importBatch(deps(author), { batchId: BATCH });
    expect(result).toMatchObject({ ok: false, code: "not_ready" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes on the database's refusal", async () => {
    const { author } = teacher(true, {
      ai_import_batches: [reviewBatch],
      ai_import_entries: [{ data: [entry()] }],
    });
    withRpc(author, { data: { ok: false, reason: "entry_changed" } });
    const store = service();
    const result = await importBatch(deps(author, store), { batchId: BATCH });
    expect(result).toMatchObject({ ok: false, code: "entry_changed" });
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("names the import limit, and hides any other database error", async () => {
    const replies = () => ({
      ai_import_batches: [reviewBatch],
      ai_import_entries: [{ data: [entry()] }],
    });
    const limited = teacher(true, replies());
    withRpc(limited.author, { error: { code: "54000" } });
    expect(await importBatch(deps(limited.author), { batchId: BATCH })).toMatchObject({
      code: "import_limited",
    });
    const broken = teacher(true, replies());
    withRpc(broken.author, { error: { code: "XX000" } });
    expect(await importBatch(deps(broken.author), { batchId: BATCH })).toMatchObject({
      code: "unavailable",
    });
  });

  it("refuses a batch that is imported, not in review, gone, or whose quiz is gone", async () => {
    const cases: [Reply, string][] = [
      [{ data: { status: "imported", bank_id: BANK } }, "already_imported"],
      [{ data: { status: "parsing", bank_id: BANK } }, "not_review"],
      [{ data: { status: "review", bank_id: null } }, "quiz_gone"],
      [{ data: null }, "not_found"],
    ];
    for (const [batch, code] of cases) {
      const { author } = teacher(true, { ai_import_batches: [batch] });
      const rpc = withRpc(author, {});
      expect(await importBatch(deps(author), { batchId: BATCH })).toMatchObject({ code });
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("refuses the signed out, a non-teacher, AI import off and a malformed request", async () => {
    expect(await importBatch(deps({ status: "signed_out" }), { batchId: BATCH })).toMatchObject({
      code: "signed_out",
    });
    expect(await importBatch(deps({ status: "forbidden" }), { batchId: BATCH })).toMatchObject({
      code: "forbidden",
    });
    const off = teacher(true);
    expect(await importBatch(deps(off.author, service(), OFF), { batchId: BATCH })).toMatchObject({
      code: "not_found",
    });
    const { author } = teacher(true);
    expect(await importBatch(deps(author), { batchId: "nope" })).toMatchObject({
      code: "malformed",
    });
  });

  it("keeps the import when the files cannot be removed yet; they stay queued", async () => {
    const { author } = teacher(true, {
      ai_import_batches: [reviewBatch],
      ai_import_entries: [{ data: [entry()] }],
    });
    withRpc(author, { data: { ok: true, questions: 1, case_studies: 0 } });
    const store = service([{ data: [{ storage_path: PATH }] }]);
    store.remove.mockResolvedValueOnce({ data: [], error: { message: "down" } } as never);
    const result = await importBatch(deps(author, store), { batchId: BATCH });
    expect(result).toMatchObject({ ok: true });
    expect(store.fake.stepsOn("ai_import_object_deletes", "delete")).toEqual([]);
  });
});

describe("discardBatch", () => {
  it("deletes an open batch with the teacher's session, then removes its files", async () => {
    const { author, session } = teacher(true, {
      ai_import_batches: [reviewBatch, { data: [{ id: BATCH }] }],
    });
    const store = service();
    expect(await discardBatch(deps(author, store), { batchId: BATCH })).toEqual({
      ok: true,
      bankId: BANK,
    });
    expect(session.stepsOn("ai_import_batches", "in")).toEqual([
      ["status", ["uploading", "parsing", "review", "failed"]],
    ]);
    expect(session.stepsOn("ai_import_batches", "eq")).toContainEqual(["org_id", ORG]);
    expect(store.remove).toHaveBeenCalledWith([PATH]);
  });

  it("refuses an imported batch, and one it could not find", async () => {
    const imported = teacher(true, {
      ai_import_batches: [{ data: { status: "imported", bank_id: BANK } }],
    });
    expect(await discardBatch(deps(imported.author), { batchId: BATCH })).toMatchObject({
      code: "already_imported",
    });
    const gone = teacher(true, { ai_import_batches: [{ data: null }] });
    expect(await discardBatch(deps(gone.author), { batchId: BATCH })).toMatchObject({
      code: "not_found",
    });
    const raced = teacher(true, { ai_import_batches: [reviewBatch, { data: [] }] });
    expect(await discardBatch(deps(raced.author), { batchId: BATCH })).toMatchObject({
      code: "not_found",
    });
  });

  it("answers unavailable when the delete fails", async () => {
    const { author } = teacher(true, {
      ai_import_batches: [reviewBatch, { error: { code: "XX000" } }],
    });
    expect(await discardBatch(deps(author), { batchId: BATCH })).toMatchObject({
      code: "unavailable",
    });
  });
});
