import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import {
  createLibraryFolder,
  createQuizInFolder,
  deleteLibraryFolder,
  moveQuizzes,
  quizLibraryTrail,
  readLibrary,
  renameLibraryFolder,
} from "./libraryData";
import { FOLDERS_NOT_READY } from "./libraryFolders";

const MED_SURG = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e01";
const WEEK_1 = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e02";
const QUIZ_1 = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f01";
const QUIZ_2 = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f02";
const ORG = "00000000-0000-4000-8000-000000000001";

interface Call {
  table: string;
  steps: [string, unknown[]][];
}

type Result = { data?: unknown; error?: { code?: string } | null; count?: number | null };
type Answer = (call: Call) => Result;

/**
 * A stand-in for the Supabase client: every chain records its steps and, when awaited, gets the
 * answer `answer` gives for it. Enough to see what was asked and to play each database reply.
 */
function fakeClient(answer: Answer) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, steps: [] };
      calls.push(call);
      const reply = () => {
        const result = answer(call);
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
          count: result.count ?? null,
        });
      };
      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          reply().then(resolve, reject),
        maybeSingle: () => (call.steps.push(["maybeSingle", []]), reply()),
        single: () => (call.steps.push(["single", []]), reply()),
      };
      for (const step of [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "is",
        "in",
        "order",
        "limit",
      ]) {
        builder[step] = (...args: unknown[]) => {
          call.steps.push([step, args]);
          return builder;
        };
      }
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

const has = (call: Call, step: string) => call.steps.some(([name]) => name === step);
const arg = (call: Call, step: string) => call.steps.find(([name]) => name === step)?.[1];

const FOLDER_ROWS = [
  { id: MED_SURG, parent_id: null, name: "Med-Surg", item_banks: [{ count: 2 }] },
  { id: WEEK_1, parent_id: MED_SURG, name: "Week 1", item_banks: [{ count: 0 }] },
];
const QUIZ_ROWS = [
  { id: QUIZ_1, name: "Cardiac week", updated_at: "2026-10-01T10:00:00Z", items: [{ count: 3 }] },
];

describe("readLibrary", () => {
  it("reads every folder with its quiz count, and the top level's quizzes in no folder", async () => {
    const { client, calls } = fakeClient((call) =>
      call.table === "library_folders" ? { data: FOLDER_ROWS } : { data: QUIZ_ROWS },
    );
    const library = await readLibrary(client, { kind: "top" });
    expect(library).toEqual({
      ready: true,
      folders: [
        { id: MED_SURG, parentId: null, name: "Med-Surg", quizCount: 2 },
        { id: WEEK_1, parentId: MED_SURG, name: "Week 1", quizCount: 0 },
      ],
      quizzes: [
        { id: QUIZ_1, name: "Cardiac week", updatedAt: "2026-10-01T10:00:00Z", itemCount: 3 },
      ],
    });
    const quizzes = calls.find((call) => call.table === "item_banks")!;
    expect(arg(quizzes, "is")).toEqual(["library_folder_id", null]);
  });

  it("reads an open folder's own quizzes", async () => {
    const { client, calls } = fakeClient((call) =>
      call.table === "library_folders" ? { data: FOLDER_ROWS } : { data: [] },
    );
    await readLibrary(client, { kind: "folder", id: MED_SURG });
    const quizzes = calls.find((call) => call.table === "item_banks")!;
    expect(arg(quizzes, "eq")).toEqual(["library_folder_id", MED_SURG]);
  });

  it("lists the quizzes as before, with no folders, when the database has none yet", async () => {
    const { client } = fakeClient((call) => {
      if (call.table === "library_folders") return { error: { code: "PGRST205" } };
      // The folder-aware read names a column the database lacks; the plain one does not.
      if (call.steps.some(([, args]) => String(args[0]).includes("library_folder_id"))) {
        return { error: { code: "42703" } };
      }
      return { data: QUIZ_ROWS };
    });
    const library = await readLibrary(client, { kind: "top" });
    expect(library.ready).toBe(false);
    expect(library.folders).toEqual([]);
    expect(library.quizzes.map((quiz) => quiz.name)).toEqual(["Cardiac week"]);
  });

  it("throws on any other failure", async () => {
    const { client } = fakeClient((call) =>
      call.table === "library_folders" ? { error: { code: "XX000" } } : { data: [] },
    );
    await expect(readLibrary(client, { kind: "top" })).rejects.toThrow(
      "Folders could not be loaded.",
    );
  });
});

describe("quizLibraryTrail", () => {
  it("names the folders a quiz sits in, from the top", async () => {
    const { client } = fakeClient((call) =>
      call.table === "item_banks" ? { data: { library_folder_id: WEEK_1 } } : { data: FOLDER_ROWS },
    );
    const trail = await quizLibraryTrail(client, QUIZ_1);
    expect(trail.map((row) => row.name)).toEqual(["Med-Surg", "Week 1"]);
  });

  it("is empty for a quiz in no folder, and when the column is missing", async () => {
    const none = fakeClient(() => ({ data: { library_folder_id: null } }));
    expect(await quizLibraryTrail(none.client, QUIZ_1)).toEqual([]);
    const missing = fakeClient(() => ({ error: { code: "42703" } }));
    expect(await quizLibraryTrail(missing.client, QUIZ_1)).toEqual([]);
  });
});

describe("createLibraryFolder", () => {
  it("inserts the workspace, parent and name only", async () => {
    const { client, calls } = fakeClient((call) =>
      has(call, "insert") ? { data: { id: MED_SURG } } : { data: { depth: 1 } },
    );
    expect(
      await createLibraryFolder(client, { orgId: ORG, parentId: null, name: "Med-Surg" }),
    ).toEqual({ ok: true, value: { id: MED_SURG } });
    expect(arg(calls.at(-1)!, "insert")).toEqual([
      { org_id: ORG, parent_id: null, name: "Med-Surg" },
    ]);
  });

  it("refuses a folder inside a folder that is already two deep", async () => {
    const { client, calls } = fakeClient(() => ({ data: { depth: 2 } }));
    expect(
      await createLibraryFolder(client, { orgId: ORG, parentId: WEEK_1, name: "Monday" }),
    ).toEqual({ ok: false, error: "Folders go at most 2 levels deep." });
    expect(calls.some((call) => has(call, "insert"))).toBe(false);
  });

  it("says a parent that is gone is gone", async () => {
    const { client } = fakeClient(() => ({ data: null }));
    const result = await createLibraryFolder(client, {
      orgId: ORG,
      parentId: WEEK_1,
      name: "Monday",
    });
    expect(result).toEqual({
      ok: false,
      error: "That folder no longer exists. Reload the page and try again.",
    });
  });

  it("names a duplicate, and says when folders are not ready", async () => {
    const duplicate = fakeClient(() => ({ error: { code: "23505" } }));
    expect(
      await createLibraryFolder(duplicate.client, { orgId: ORG, parentId: null, name: "Peds" }),
    ).toEqual({ ok: false, error: 'There is already a folder named "Peds" here.' });
    const missing = fakeClient(() => ({ error: { code: "PGRST205" } }));
    expect(
      await createLibraryFolder(missing.client, { orgId: ORG, parentId: null, name: "Peds" }),
    ).toEqual({ ok: false, error: FOLDERS_NOT_READY });
  });
});

describe("renameLibraryFolder", () => {
  it("renames, and says when the folder is gone or folders are not ready", async () => {
    expect(
      await renameLibraryFolder(
        fakeClient(() => ({ data: [{ id: MED_SURG }] })).client,
        MED_SURG,
        "Adult health",
      ),
    ).toEqual({ ok: true, value: null });
    expect(
      await renameLibraryFolder(fakeClient(() => ({ data: [] })).client, MED_SURG, "X"),
    ).toMatchObject({
      ok: false,
      error: "That folder no longer exists. Reload the page and try again.",
    });
    expect(
      await renameLibraryFolder(
        fakeClient(() => ({ error: { code: "PGRST205" } })).client,
        MED_SURG,
        "X",
      ),
    ).toEqual({ ok: false, error: FOLDERS_NOT_READY });
  });
});

describe("deleteLibraryFolder", () => {
  const folder = { data: { id: MED_SURG, name: "Med-Surg", parent_id: null } };

  it("deletes an empty folder and opens its parent", async () => {
    const { client, calls } = fakeClient((call) => {
      if (has(call, "delete")) return { data: [{ id: MED_SURG }] };
      if (has(call, "maybeSingle")) return folder;
      return { count: 0 };
    });
    expect(await deleteLibraryFolder(client, MED_SURG)).toEqual({
      ok: true,
      value: { parentId: null },
    });
    expect(calls.some((call) => has(call, "delete"))).toBe(true);
  });

  it("refuses a folder holding quizzes, and deletes nothing", async () => {
    const { client, calls } = fakeClient((call) => {
      if (has(call, "maybeSingle")) return folder;
      return { count: call.table === "item_banks" ? 2 : 0 };
    });
    expect(await deleteLibraryFolder(client, MED_SURG)).toEqual({
      ok: false,
      error: '"Med-Surg" holds 2 quizzes. Move them out first.',
    });
    expect(calls.some((call) => has(call, "delete"))).toBe(false);
  });

  it("says when folders are not ready", async () => {
    const { client } = fakeClient(() => ({ error: { code: "PGRST205" } }));
    expect(await deleteLibraryFolder(client, MED_SURG)).toEqual({
      ok: false,
      error: FOLDERS_NOT_READY,
    });
  });
});

describe("moveQuizzes", () => {
  it("files the quizzes in one update and says where they went", async () => {
    const { client, calls } = fakeClient((call) =>
      call.table === "library_folders"
        ? { data: FOLDER_ROWS }
        : { data: [{ id: QUIZ_1 }, { id: QUIZ_2 }] },
    );
    expect(await moveQuizzes(client, { folderId: WEEK_1, quizIds: [QUIZ_1, QUIZ_2] })).toEqual({
      ok: true,
      value: { message: "Moved 2 quizzes to Med-Surg/Week 1." },
    });
    const update = calls.find((call) => has(call, "update"))!;
    expect(arg(update, "update")).toEqual([{ library_folder_id: WEEK_1 }]);
    expect(arg(update, "in")).toEqual(["id", [QUIZ_1, QUIZ_2]]);
  });

  it("takes quizzes out of every folder", async () => {
    const { client } = fakeClient(() => ({ data: [{ id: QUIZ_1 }] }));
    expect(await moveQuizzes(client, { folderId: null, quizIds: [QUIZ_1] })).toEqual({
      ok: true,
      value: { message: "Moved 1 quiz to Not in a folder." },
    });
  });

  it("refuses an unknown folder before writing, and a folder that went away while writing", async () => {
    const unknown = fakeClient(() => ({ data: FOLDER_ROWS }));
    const other = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4eff";
    expect(await moveQuizzes(unknown.client, { folderId: other, quizIds: [QUIZ_1] })).toMatchObject(
      {
        ok: false,
      },
    );
    expect(unknown.calls.some((call) => has(call, "update"))).toBe(false);

    const raced = fakeClient((call) =>
      has(call, "update") ? { error: { code: "23503" } } : { data: FOLDER_ROWS },
    );
    expect(await moveQuizzes(raced.client, { folderId: MED_SURG, quizIds: [QUIZ_1] })).toEqual({
      ok: false,
      error: "That folder no longer exists. Reload the page and try again.",
    });
  });

  it("says nothing moved when no quiz matched, and when folders are not ready", async () => {
    const none = fakeClient(() => ({ data: [] }));
    expect(await moveQuizzes(none.client, { folderId: null, quizIds: [QUIZ_1] })).toMatchObject({
      ok: false,
      error: "Nothing was moved. Reload the page and try again.",
    });
    const missing = fakeClient(() => ({ error: { code: "PGRST204" } }));
    expect(await moveQuizzes(missing.client, { folderId: null, quizIds: [QUIZ_1] })).toEqual({
      ok: false,
      error: FOLDERS_NOT_READY,
    });
  });
});

describe("createQuizInFolder", () => {
  it("creates the quiz filed in the folder", async () => {
    const { client, calls } = fakeClient(() => ({ data: { id: QUIZ_1 } }));
    expect(
      await createQuizInFolder(client, {
        name: "Peds 1",
        orgId: ORG,
        userId: "u",
        folderId: MED_SURG,
      }),
    ).toEqual({ ok: true, value: { id: QUIZ_1 } });
    expect(arg(calls[0]!, "insert")).toEqual([
      { name: "Peds 1", org_id: ORG, created_by: "u", library_folder_id: MED_SURG },
    ]);
  });

  it("says when the folder is gone or folders are not ready", async () => {
    const gone = fakeClient(() => ({ error: { code: "23503" } }));
    expect(
      await createQuizInFolder(gone.client, {
        name: "Q",
        orgId: ORG,
        userId: "u",
        folderId: MED_SURG,
      }),
    ).toMatchObject({ ok: false });
    const missing = fakeClient(() => ({ error: { code: "PGRST204" } }));
    expect(
      await createQuizInFolder(missing.client, {
        name: "Q",
        orgId: ORG,
        userId: "u",
        folderId: MED_SURG,
      }),
    ).toEqual({ ok: false, error: FOLDERS_NOT_READY });
  });
});
