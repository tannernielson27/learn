import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { QUIZ_MOVE_NOT_READY, TURN_NOT_READY } from "./quizMove";
import { moveToQuiz, readMoveContext, turnFolderIntoQuiz } from "./quizMoveData";
import { RATE_LIMIT_ERRORS } from "./rateLimit";

const SOURCE = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f01";
const TARGET = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f02";
const ITEM = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a01";
const FOLDER = "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e01";

interface Call {
  table: string;
  steps: [string, unknown[]][];
}

type DbError = { code?: string; hint?: string; details?: string };
type Result = { data?: unknown; error?: DbError | null; count?: number | null };

/** A stand-in for the Supabase client that records each chain and each rpc, and plays replies. */
function fakeClient(
  answer: (call: Call) => Result,
  rpcAnswer: (name: string) => Result = () => ({}),
) {
  const calls: Call[] = [];
  const rpcs: [string, unknown][] = [];
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
      };
      for (const step of ["select", "eq", "neq", "gt", "order", "limit"]) {
        builder[step] = (...args: unknown[]) => {
          call.steps.push([step, args]);
          return builder;
        };
      }
      return builder;
    },
    rpc(name: string, args: unknown) {
      rpcs.push([name, args]);
      const result = rpcAnswer(name);
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls, rpcs };
}

const arg = (call: Call, step: string) => call.steps.find(([name]) => name === step)?.[1];

describe("readMoveContext", () => {
  it("lists the other quizzes and counts this quiz's open assignments and live sessions", async () => {
    const now = new Date("2026-10-14T12:00:00Z");
    const { client, calls } = fakeClient((call) => {
      if (call.table === "item_banks") return { data: [{ id: TARGET, name: "Renal week" }] };
      if (call.table === "assignments") return { count: 2 };
      return { count: 3 };
    });
    expect(await readMoveContext(client, SOURCE, now)).toEqual({
      quizzes: [{ id: TARGET, name: "Renal week" }],
      uses: { assignments: 2, liveSessions: 3 },
    });
    const [quizzes, assignments, sessions] = calls;
    expect(arg(quizzes!, "neq")).toEqual(["id", SOURCE]);
    expect(arg(assignments!, "eq")).toEqual(["bank_id", SOURCE]);
    // Not closed yet: open now, or still to open.
    expect(arg(assignments!, "gt")).toEqual(["closes_at", now.toISOString()]);
    expect(arg(sessions!, "eq")).toEqual(["bank_id", SOURCE]);
  });

  it("is null when anything cannot be read, so no unsure move is offered", async () => {
    for (const failing of ["item_banks", "assignments", "sessions"]) {
      const { client } = fakeClient((call) =>
        call.table === failing ? { error: { code: "XX000" } } : { data: [], count: 0 },
      );
      expect(await readMoveContext(client, SOURCE)).toBeNull();
    }
  });
});

describe("moveToQuiz", () => {
  const move = { quizId: TARGET, itemIds: [ITEM], caseStudyIds: [] };
  const target = () => ({ data: { name: "Renal week" } });

  it("moves in one call and names where", async () => {
    const { client, rpcs } = fakeClient(target, () => ({
      data: { items: 1, case_studies: 0, steps: 0 },
    }));
    expect(await moveToQuiz(client, SOURCE, move)).toEqual({
      ok: true,
      value: { message: "Moved 1 question to Renal week." },
    });
    expect(rpcs).toEqual([
      [
        "move_to_quiz",
        { source_bank: SOURCE, target_bank: TARGET, item_ids: [ITEM], case_study_ids: [] },
      ],
    ]);
  });

  it("refuses a quiz it cannot see before calling anything", async () => {
    const { client, rpcs } = fakeClient(() => ({ data: null }));
    expect(await moveToQuiz(client, SOURCE, move)).toEqual({
      ok: false,
      error: "That quiz no longer exists. Reload the page and try again.",
    });
    expect(rpcs).toEqual([]);
  });

  it("says plainly that moving is not ready when the database has no move_to_quiz yet", async () => {
    const { client } = fakeClient(target, () => ({ error: { code: "PGRST202" } }));
    expect(await moveToQuiz(client, SOURCE, move)).toEqual({
      ok: false,
      error: QUIZ_MOVE_NOT_READY,
    });
  });

  it("passes on the database's refusals in plain words", async () => {
    const limited = fakeClient(target, () => ({ error: { code: "54000" } }));
    expect(await moveToQuiz(limited.client, SOURCE, move)).toEqual({
      ok: false,
      error: RATE_LIMIT_ERRORS.limited,
    });
    const step = fakeClient(target, () => ({
      error: { code: "2BP01", hint: "1", details: "Sepsis" },
    }));
    expect(await moveToQuiz(step.client, SOURCE, move)).toEqual({
      ok: false,
      error:
        'That question is step 1 of the case study "Sepsis". Select the case study to move it.',
    });
  });
});

describe("turnFolderIntoQuiz", () => {
  it("returns the new quiz", async () => {
    const { client, rpcs } = fakeClient(
      () => ({ data: { name: "Cardiac" } }),
      () => ({ data: { quiz: TARGET, name: "Cardiac", items: 2, case_studies: 1, steps: 6 } }),
    );
    expect(await turnFolderIntoQuiz(client, FOLDER)).toEqual({
      ok: true,
      value: { quizId: TARGET },
    });
    expect(rpcs).toEqual([["turn_folder_into_quiz", { target_folder: FOLDER }]]);
  });

  it("says plainly that it is not ready when the database has no turn_folder_into_quiz yet", async () => {
    const { client } = fakeClient(
      () => ({ data: { name: "Cardiac" } }),
      () => ({ error: { code: "PGRST202" } }),
    );
    expect(await turnFolderIntoQuiz(client, FOLDER)).toEqual({
      ok: false,
      error: TURN_NOT_READY,
    });
  });

  it("refuses an empty folder in plain words", async () => {
    const { client } = fakeClient(
      () => ({ data: { name: "Cardiac" } }),
      () => ({ error: { code: "22023", hint: "empty" } }),
    );
    expect(await turnFolderIntoQuiz(client, FOLDER)).toEqual({
      ok: false,
      error: '"Cardiac" holds no questions or case studies of its own. Delete it instead.',
    });
  });

  it("treats a reply without a quiz as a failure", async () => {
    const { client } = fakeClient(
      () => ({ data: { name: "Cardiac" } }),
      () => ({ data: {} }),
    );
    expect((await turnFolderIntoQuiz(client, FOLDER)).ok).toBe(false);
  });

  it("refuses a folder it cannot see before calling anything, whatever name the page held", async () => {
    const { client, rpcs } = fakeClient(() => ({ data: null }));
    expect(await turnFolderIntoQuiz(client, FOLDER)).toEqual({
      ok: false,
      error: "That folder no longer exists. Reload the page and try again.",
    });
    expect(rpcs).toEqual([]);
  });
});
