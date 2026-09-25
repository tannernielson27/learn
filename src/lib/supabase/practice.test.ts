import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import type { Database } from "./database.types";
import { toItemRow } from "./itemRows";
import {
  MAX_RUN_ITEM_READ,
  openPracticeRun,
  readMyPracticeBanks,
  readMyPracticeStepMarks,
  readPracticeCaseStudies,
  readRunAnswers,
  readRunItems,
  readRunSlots,
  recordPracticeResponse,
} from "./practice";

type Reply = { data: unknown; error: { code?: string } | null };

function rpcClient(reply: Reply) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

/** A query builder that records its calls and resolves to `reply` when awaited. */
function tableClient(reply: Reply) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "limit"]) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: Reply) => unknown) => resolve(reply);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient<Database>, from, calls };
}

const STUDENT = "00000000-0000-4000-8000-0000000000d1";
const BANK = "00000000-0000-4000-8000-0000000000b1";
const RUN = "00000000-0000-4000-8000-0000000000a1";

describe("openPracticeRun", () => {
  it("names the student and the bank, and hands back the run", async () => {
    const { client, rpc } = rpcClient({
      data: [{ run_id: RUN, bank_id: BANK, bank_name: "Cardiac week", seed: "s", started_at: "t" }],
      error: null,
    });
    expect(await openPracticeRun(client, STUDENT, BANK, true)).toEqual({
      ok: true,
      run: { runId: RUN, bankId: BANK, bankName: "Cardiac week", seed: "s" },
    });
    expect(rpc).toHaveBeenCalledWith("open_practice_run", {
      student: STUDENT,
      target_bank: BANK,
      fresh: true,
    });
  });

  it("is not_found with no row, and failed on an error", async () => {
    expect(
      await openPracticeRun(rpcClient({ data: [], error: null }).client, STUDENT, BANK, false),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(
      await openPracticeRun(
        rpcClient({ data: null, error: { code: "42501" } }).client,
        STUDENT,
        BANK,
        false,
      ),
    ).toEqual({ ok: false, reason: "failed" });
  });
});

describe("readRunSlots", () => {
  it("lists the slots in play order with the answered ones", async () => {
    const { client } = rpcClient({
      data: [
        { item_id: "b", case_study_id: "c", step: 1, ordinal: 2, answered: true },
        { item_id: "a", case_study_id: null, step: null, ordinal: 1, answered: false },
      ],
      error: null,
    });
    const read = await readRunSlots(client, STUDENT, RUN);
    expect(read?.slots).toEqual([
      { itemId: "a", caseStudyId: null, step: null },
      { itemId: "b", caseStudyId: "c", step: 1 },
    ]);
    expect([...(read?.answered ?? [])]).toEqual(["b"]);
  });

  it("is null on an error", async () => {
    expect(
      await readRunSlots(rpcClient({ data: null, error: {} }).client, STUDENT, RUN),
    ).toBeNull();
  });
});

describe("readRunItems", () => {
  const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
  const MC_ROW = "00000000-0000-4000-8000-0000000000f1";
  const BAD_ROW = "00000000-0000-4000-8000-0000000000f2";
  const row = { item_id: MC_ROW, ...toItemRow(MC) };

  it("reads the run's own content for this student, in the order asked, dropping what does not parse", async () => {
    const { client, rpc } = rpcClient({
      data: [{ ...row, item_id: BAD_ROW, content: "not an item" }, row],
      error: null,
    });
    const read = await readRunItems(client, STUDENT, RUN, [BAD_ROW, MC_ROW]);
    expect(read).toEqual([{ rowId: MC_ROW, item: expect.objectContaining({ type: MC.type }) }]);
    expect(read?.[0]?.item.answerKey).toEqual(MC.answerKey);
    expect(rpc).toHaveBeenCalledWith("practice_run_item_content", {
      student: STUDENT,
      target_run: RUN,
      target_items: [BAD_ROW, MC_ROW],
    });
  });

  it("asks nothing for no items, and is null on an error", async () => {
    const { client, rpc } = rpcClient({ data: [], error: null });
    expect(await readRunItems(client, STUDENT, RUN, [])).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    expect(
      await readRunItems(rpcClient({ data: null, error: {} }).client, STUDENT, RUN, [MC_ROW]),
    ).toBeNull();
  });

  it("fails rather than truncating past the function's row limit", async () => {
    const { client, rpc } = rpcClient({ data: [], error: null });
    const ids = Array.from({ length: MAX_RUN_ITEM_READ + 1 }, () => MC_ROW);
    expect(await readRunItems(client, STUDENT, RUN, ids)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("readRunAnswers and readPracticeCaseStudies", () => {
  it("reads one run's answers by item", async () => {
    const fake = tableClient({ data: [{ item_id: "a", response: { type: "x" } }], error: null });
    expect(await readRunAnswers(fake.client, RUN)).toEqual({ a: { type: "x" } });
    expect(fake.from).toHaveBeenCalledWith("practice_responses");
    expect(fake.calls).toContainEqual(["eq", ["run_id", RUN]]);
  });

  it("is null when the answers cannot be read", async () => {
    expect(await readRunAnswers(tableClient({ data: null, error: {} }).client, RUN)).toBeNull();
  });

  it("reads a case study's title and record only", async () => {
    const fake = tableClient({ data: [{ id: "c", title: "Hip", ehr: {} }], error: null });
    expect(await readPracticeCaseStudies(fake.client, ["c"])).toEqual([
      { id: "c", title: "Hip", ehr: {} },
    ]);
    expect(fake.calls).toContainEqual(["select", ["id, title, ehr"]]);
    expect(await readPracticeCaseStudies(fake.client, [])).toEqual([]);
    expect(
      await readPracticeCaseStudies(tableClient({ data: null, error: {} }).client, ["c"]),
    ).toBeNull();
  });
});

describe("recordPracticeResponse", () => {
  const input = {
    student: STUDENT,
    runId: RUN,
    itemId: "i",
    response: { type: "multiple_choice" as const, optionId: "opt_a" },
    score: { model: "zero_one" as const, maxPoints: 1, points: 1, breakdown: [] },
  };

  it("sends the score to the service-role function and passes its answer back", async () => {
    const { client, rpc } = rpcClient({ data: "recorded", error: null });
    expect(await recordPracticeResponse(client, input)).toBe("recorded");
    expect(rpc).toHaveBeenCalledWith("record_practice_response", {
      student: STUDENT,
      target_run: RUN,
      target_item: "i",
      answer: input.response,
      earned: 1,
      possible: 1,
      marks: input.score,
    });
  });

  it.each([
    ["answered", "answered"],
    ["not_found", "not_found"],
    ["something else", "failed"],
  ])("maps %s", async (data, outcome) => {
    expect(await recordPracticeResponse(rpcClient({ data, error: null }).client, input)).toBe(
      outcome,
    );
  });

  it("is failed on an error", async () => {
    expect(await recordPracticeResponse(rpcClient({ data: null, error: {} }).client, input)).toBe(
      "failed",
    );
  });
});

describe("the student's own reads", () => {
  it("lists the practice banks", async () => {
    const { client, rpc } = rpcClient({
      data: [{ bank_id: BANK, bank_name: "Cardiac week", item_count: 21, answered: 2 }],
      error: null,
    });
    expect(await readMyPracticeBanks(client)).toEqual([
      { bankId: BANK, name: "Cardiac week", itemCount: 21, answered: 2 },
    ]);
    expect(rpc).toHaveBeenCalledWith("my_practice_banks");
    expect(await readMyPracticeBanks(rpcClient({ data: null, error: {} }).client)).toBeNull();
  });

  it("reads practice marks, leaving out any that are not numbers", async () => {
    const { client } = rpcClient({
      data: [
        { cjmm_step: 1, points: 1, max_points: 1 },
        { cjmm_step: null, points: "0.5", max_points: "1" },
        { cjmm_step: 2, points: "x", max_points: 1 },
        { cjmm_step: 3, points: 1, max_points: "" },
      ],
      error: null,
    });
    expect(await readMyPracticeStepMarks(client)).toEqual([
      { cjmmStep: 1, points: 1, maxPoints: 1 },
      { cjmmStep: null, points: 0.5, maxPoints: 1 },
    ]);
    expect(await readMyPracticeStepMarks(rpcClient({ data: null, error: {} }).client)).toBeNull();
  });
});
