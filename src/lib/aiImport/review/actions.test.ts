import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteAuthor } from "@/lib/authoring/session";
import {
  BATCH,
  OFF,
  ON,
  ORG,
  fakeClient,
  teacher,
  type Reply,
} from "../upload/testing/fakeSupabase";
import { dropEntries, dropEntry, restoreEntry, type ReviewActionDeps } from "./actions";

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

describe("the duplicate flags after a drop or a restore (#593)", () => {
  const stems = [
    { id: "first", position: 0, status: "dropped", reasons: [], stem: "Which food first?" },
    {
      id: "later",
      position: 2,
      status: "ready",
      reasons: ["duplicate: The same question is earlier in this import. Keep one of them."],
      stem: "Which food first?",
    },
  ];

  it("works the batch's flags out again with the service client, named by the session's workspace", async () => {
    const { author } = teacher(true, {
      ai_import_entries: [row(), { data: [{ version: 4, status: "dropped" }] }],
      ai_import_batches: [reviewBatch],
    });
    const service = fakeClient({
      ai_import_entries: [{ data: stems }, { data: [{ id: "later", version: 8 }] }],
      ai_import_files: [{ data: [] }],
    });
    const result = await dropEntry(
      { ...deps(author), service: () => service.client },
      { batchId: BATCH, entryId: ENTRY, version: 3 },
    );
    // The page showed "later" at an older version; it is told the new one.
    expect(result).toEqual({
      ok: true,
      version: 4,
      status: "dropped",
      changed: [{ id: "later", version: 8 }],
    });
    // The earlier copy is dropped, so the later one is no longer a duplicate.
    expect(service.stepsOn("ai_import_entries", "update")).toEqual([[{ reasons: [] }]]);
    expect(service.stepsOn("ai_import_entries", "eq")).toEqual(
      expect.arrayContaining([
        ["batch_id", BATCH],
        ["org_id", ORG],
        ["id", "later"],
      ]),
    );
    // Only stems are read for it, never a whole question with its key.
    const selected = String(service.stepsOn("ai_import_entries", "select")[0]?.[0]);
    expect(selected).toContain("stem:item->stem->>value");
    expect(selected).not.toMatch(/(^|, )item(,|$)/);
  });

  it("answers a restore with the version the flag pass left the entry at", async () => {
    const { author } = teacher(true, {
      ai_import_entries: [row({ status: "dropped" }), { data: [{ version: 4, status: "ready" }] }],
      ai_import_batches: [reviewBatch],
    });
    const service = fakeClient({
      ai_import_entries: [
        {
          data: [
            { id: "first", position: 0, status: "ready", reasons: [], stem: "Which food first?" },
            { id: ENTRY, position: 2, status: "ready", reasons: [], stem: "Which food first?" },
          ],
        },
        { data: [{ id: ENTRY, version: 5 }] },
      ],
      ai_import_files: [{ data: [] }],
    });
    const result = await restoreEntry(
      { ...deps(author), service: () => service.client },
      { batchId: BATCH, entryId: ENTRY, version: 3 },
    );
    expect(result).toEqual({ ok: true, version: 5, status: "ready" });
  });

  it("still answers the drop when the flag pass fails", async () => {
    const { author } = teacher(true, {
      ai_import_entries: [row(), { data: [{ version: 4, status: "dropped" }] }],
      ai_import_batches: [reviewBatch],
    });
    const service = fakeClient({
      ai_import_entries: [{ error: { code: "XX000" } }],
      ai_import_files: [{ data: [] }],
    });
    const result = await dropEntry(
      { ...deps(author), service: () => service.client },
      { batchId: BATCH, entryId: ENTRY, version: 3 },
    );
    expect(result).toEqual({ ok: true, version: 4, status: "dropped" });
  });
});

describe("dropEntries (#593, drop the N that need attention)", () => {
  const A = "00000000-0000-4000-8000-0000000000e1";
  const B = "00000000-0000-4000-8000-0000000000e2";
  const shown = [
    { entryId: A, version: 3 },
    { entryId: B, version: 7 },
  ];

  it("drops each entry only where it is at the shown version and still needs attention", async () => {
    const { author, session } = teacher(true, {
      ai_import_batches: [reviewBatch],
      ai_import_entries: [{ data: [{ id: A, version: 4 }] }],
    });
    const result = await dropEntries(deps(author), { batchId: BATCH, entries: shown });
    // B changed in another tab, so it was left and counted.
    expect(result).toEqual({ ok: true, dropped: [{ id: A, version: 4 }], left: 1 });
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([[{ status: "dropped" }]]);
    expect(session.stepsOn("ai_import_entries", "eq")).toEqual([
      ["batch_id", BATCH],
      ["org_id", ORG],
    ]);
    expect(session.stepsOn("ai_import_entries", "in")).toEqual([
      ["status", ["needs_answer", "needs_fix"]],
    ]);
    expect(session.stepsOn("ai_import_entries", "or")).toEqual([
      [`and(id.eq.${A},version.eq.3),and(id.eq.${B},version.eq.7)`],
    ]);
  });

  it("names at most thirty entries in one request", async () => {
    const many = Array.from({ length: 65 }, (_, index) => ({
      entryId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      version: 1,
    }));
    const { author, session } = teacher(true, {
      ai_import_batches: [reviewBatch],
      ai_import_entries: [{ data: [] }, { data: [] }, { data: [] }],
    });
    expect(await dropEntries(deps(author), { batchId: BATCH, entries: many })).toEqual({
      ok: true,
      dropped: [],
      left: 65,
    });
    expect(session.stepsOn("ai_import_entries", "or")).toHaveLength(3);
  });

  it("works the duplicate flags out again once something was dropped", async () => {
    const { author } = teacher(true, {
      ai_import_batches: [reviewBatch],
      ai_import_entries: [{ data: [{ id: A, version: 4 }] }],
    });
    const service = fakeClient({
      ai_import_entries: [{ data: [] }],
      ai_import_files: [{ data: [] }],
    });
    await dropEntries(
      { ...deps(author), service: () => service.client },
      { batchId: BATCH, entries: shown },
    );
    expect(service.left()).toEqual([]);
  });

  it("refuses anything that is not a list of ids and versions, with nothing written", async () => {
    const { author, session } = teacher(true, {});
    for (const bad of [
      null,
      { batchId: BATCH },
      { batchId: BATCH, entries: [] },
      { batchId: BATCH, entries: [{ entryId: "1),and(status.eq.ready", version: 1 }] },
      { batchId: BATCH, entries: [{ entryId: A, version: "1" }] },
      { batchId: BATCH, entries: Array.from({ length: 151 }, () => shown[0]) },
    ]) {
      expect(await dropEntries(deps(author), bad)).toMatchObject({ code: "malformed" });
    }
    expect(session.stepsOn("ai_import_entries", "update")).toEqual([]);
  });

  it("checks the caller itself, and that the batch is this workspace's and in review", async () => {
    const { author } = teacher(true, {});
    const input = { batchId: BATCH, entries: shown };
    expect(
      await dropEntries({ author: async () => ({ status: "signed_out" }), env: ON }, input),
    ).toMatchObject({ code: "signed_out" });
    expect(
      await dropEntries({ author: async () => ({ status: "forbidden" }), env: ON }, input),
    ).toMatchObject({ code: "forbidden" });
    expect(await dropEntries(deps(author, OFF), input)).toMatchObject({ code: "not_found" });
    const other = teacher(true, { ai_import_batches: [{ data: null }] });
    expect(await dropEntries(deps(other.author), input)).toMatchObject({ code: "not_found" });
    const imported = teacher(true, { ai_import_batches: [{ data: { status: "imported" } }] });
    expect(await dropEntries(deps(imported.author), input)).toMatchObject({ code: "not_review" });
    const broken = teacher(true, { ai_import_batches: [{ error: { code: "XX000" } }] });
    expect(await dropEntries(deps(broken.author), input)).toMatchObject({ code: "unavailable" });
    const writeFails = teacher(true, {
      ai_import_batches: [reviewBatch],
      ai_import_entries: [{ error: { code: "XX000" } }],
    });
    expect(await dropEntries(deps(writeFails.author), input)).toMatchObject({
      code: "unavailable",
    });
  });
});
