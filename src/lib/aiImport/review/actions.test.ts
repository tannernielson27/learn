import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteAuthor } from "@/lib/authoring/session";
import { BATCH, OFF, ON, ORG, teacher, type Reply } from "../upload/testing/fakeSupabase";
import { dropEntry, restoreEntry, type ReviewActionDeps } from "./actions";

const ENTRY = "00000000-0000-4000-8000-0000000000e1";

const row = (over: Record<string, unknown> = {}): Reply => ({
  data: {
    id: ENTRY,
    version: 3,
    position: 2,
    kind: "item",
    type: "multiple_choice",
    status: "ready",
    reasons: [],
    source_excerpt: "A client reports pain.",
    item: { id: "x" },
    group_key: null,
    step: null,
    ...over,
  },
});
const reviewBatch: Reply = { data: { status: "review" } };

function deps(author: RouteAuthor, env: Record<string, string> = ON): ReviewActionDeps {
  return { author: async () => author, env };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("dropEntry", () => {
  it("drops the entry it read, with the teacher's own session and a version check", async () => {
    const { author, session } = teacher(true, {
      ai_import_entries: [row(), { data: [{ version: 4, status: "dropped" }] }],
      ai_import_batches: [reviewBatch],
    });
    const result = await dropEntry(deps(author), { batchId: BATCH, entryId: ENTRY, version: 3 });
    expect(result).toEqual({ ok: true, version: 4, status: "dropped" });
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([[{ status: "dropped" }]]);
    const filters = session.stepsOn("ai_import_entries", "eq");
    // The read and the update both name the workspace, the batch and the entry.
    expect(filters).toEqual(
      expect.arrayContaining([
        ["org_id", ORG],
        ["batch_id", BATCH],
        ["id", ENTRY],
        ["version", 3],
      ]),
    );
    expect(filters.filter(([column]) => column === "org_id")).toHaveLength(2);
  });

  it("refuses an entry another tab changed since the page read it", async () => {
    const { author, session } = teacher(true, {
      ai_import_entries: [row({ version: 5 })],
      ai_import_batches: [reviewBatch],
    });
    const result = await dropEntry(deps(author), { batchId: BATCH, entryId: ENTRY, version: 3 });
    expect(result).toMatchObject({ ok: false, code: "entry_changed" });
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([]);
  });

  it("reports a change that lands between the read and the write", async () => {
    const { author } = teacher(true, {
      ai_import_entries: [row(), { data: [] }],
      ai_import_batches: [reviewBatch],
    });
    expect(
      await dropEntry(deps(author), { batchId: BATCH, entryId: ENTRY, version: 3 }),
    ).toMatchObject({ ok: false, code: "entry_changed" });
  });

  it("leaves an entry that is already dropped as it is", async () => {
    const { author, session } = teacher(true, {
      ai_import_entries: [row({ status: "dropped" })],
      ai_import_batches: [reviewBatch],
    });
    expect(await dropEntry(deps(author), { batchId: BATCH, entryId: ENTRY, version: 3 })).toEqual({
      ok: true,
      version: 3,
      status: "dropped",
    });
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([]);
  });

  it("is not found for another workspace's entry, and changes nothing", async () => {
    const { author, session } = teacher(true, {
      ai_import_entries: [{ data: null }],
      ai_import_batches: [reviewBatch],
    });
    expect(
      await dropEntry(deps(author), { batchId: BATCH, entryId: ENTRY, version: 3 }),
    ).toMatchObject({ ok: false, code: "not_found" });
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([]);
  });

  it("changes nothing once the batch has left review", async () => {
    const { author } = teacher(true, {
      ai_import_entries: [row()],
      ai_import_batches: [{ data: { status: "imported" } }],
    });
    expect(
      await dropEntry(deps(author), { batchId: BATCH, entryId: ENTRY, version: 3 }),
    ).toMatchObject({ ok: false, code: "not_review" });
  });

  it.each([
    ["anon", { status: "signed_out" } as RouteAuthor, ON, "signed_out"],
    ["a student", { status: "forbidden", role: "student" } as RouteAuthor, ON, "forbidden"],
    ["AI import off", teacher(true).author, OFF, "not_found"],
    ["a workspace with AI import off", teacher(false).author, ON, "not_found"],
  ])("refuses %s", async (_name, author, env, code) => {
    expect(
      await dropEntry(deps(author, env), { batchId: BATCH, entryId: ENTRY, version: 3 }),
    ).toMatchObject({ ok: false, code });
  });

  it("refuses a malformed request before it reads anything", async () => {
    const { author, session } = teacher(true);
    for (const input of [
      { batchId: "nope", entryId: ENTRY, version: 3 },
      { batchId: BATCH, entryId: ENTRY, version: 0 },
      null,
    ]) {
      expect(await dropEntry(deps(author), input)).toMatchObject({ ok: false, code: "malformed" });
    }
    expect(session.stepsOn("ai_import_entries", "select")).toEqual([]);
  });

  it("answers unavailable when the read fails", async () => {
    const { author } = teacher(true, {
      ai_import_entries: [{ error: { code: "XX000" } }],
      ai_import_batches: [reviewBatch],
    });
    expect(
      await dropEntry(deps(author), { batchId: BATCH, entryId: ENTRY, version: 3 }),
    ).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("answers unavailable when the write fails", async () => {
    const { author } = teacher(true, {
      ai_import_entries: [row(), { error: { code: "XX000" } }],
      ai_import_batches: [reviewBatch],
    });
    expect(
      await dropEntry(deps(author), { batchId: BATCH, entryId: ENTRY, version: 3 }),
    ).toMatchObject({ ok: false, code: "unavailable" });
  });
});

describe("restoreEntry", () => {
  it("brings a dropped entry back to the status its reasons give it", async () => {
    const { author, session } = teacher(true, {
      ai_import_entries: [
        row({ status: "dropped", reasons: ["needs_answer: Add the key."] }),
        { data: [{ version: 4, status: "needs_answer" }] },
      ],
      ai_import_batches: [reviewBatch],
    });
    expect(
      await restoreEntry(deps(author), { batchId: BATCH, entryId: ENTRY, version: 3 }),
    ).toEqual({ ok: true, version: 4, status: "needs_answer" });
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([[{ status: "needs_answer" }]]);
  });

  it("leaves an entry that is not dropped as it is", async () => {
    const { author, session } = teacher(true, {
      ai_import_entries: [row({ status: "needs_fix" })],
      ai_import_batches: [reviewBatch],
    });
    expect(
      await restoreEntry(deps(author), { batchId: BATCH, entryId: ENTRY, version: 3 }),
    ).toEqual({ ok: true, version: 3, status: "needs_fix" });
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([]);
  });
});
