import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import type {
  AttemptCall,
  ExpiredAttempt,
  RecordInput,
  SubmissionInput,
} from "@/lib/supabase/attempts";
import type { SetItem } from "./attemptScoring";
import {
  autoSubmitExpired,
  submitAttempt,
  type AutoSubmitStore,
  type SubmitStore,
} from "./submitAttempt";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const ROW_MC = "00000000-0000-0000-0000-0000000000f1";
const ROW_MR = "00000000-0000-0000-0000-0000000000f2";
const SET: SetItem[] = [
  { rowId: ROW_MC, item: MC },
  { rowId: ROW_MR, item: MR },
];
const ATTEMPT = "00000000-0000-0000-0000-0000000000a1";
const STUDENT = "00000000-0000-0000-0000-0000000000d1";

const begun = (
  revision: number,
  answers: Record<string, unknown>,
): AttemptCall<SubmissionInput> => ({
  ok: true,
  value: { itemSet: [ROW_MC, ROW_MR], revision, answers },
});

function store(overrides: Partial<SubmitStore> = {}): SubmitStore & { recorded: RecordInput[] } {
  const recorded: RecordInput[] = [];
  return {
    recorded,
    begin: vi.fn(async () =>
      begun(3, { [ROW_MC]: { type: "multiple_choice", optionId: "opt_a" } }),
    ),
    items: vi.fn(async () => SET),
    record: vi.fn(async (input: RecordInput) => {
      recorded.push(input);
      return { ok: true, value: "2026-09-23T12:00:00Z" } as const;
    }),
    ...overrides,
  };
}

describe("submitAttempt", () => {
  it("scores what was saved on the server and records it at the revision it read", async () => {
    const fake = store();
    expect(await submitAttempt(fake, ATTEMPT, STUDENT)).toEqual({ ok: true });
    expect(fake.recorded).toHaveLength(1);
    expect(fake.recorded[0]).toMatchObject({
      attemptId: ATTEMPT,
      studentId: STUDENT,
      revision: 3,
      automatic: false,
      score: { total: 1, possible: 4 },
    });
  });

  it("reads and scores again when a save landed between reading and recording", async () => {
    let reads = 0;
    const fake = store({
      begin: vi.fn(async () => {
        reads += 1;
        return reads === 1
          ? begun(3, {})
          : begun(4, { [ROW_MC]: { type: "multiple_choice", optionId: "opt_a" } });
      }),
    });
    let records = 0;
    fake.record = vi.fn(async (input: RecordInput) => {
      records += 1;
      fake.recorded.push(input);
      return records === 1
        ? ({ ok: false, refusal: "changed" } as const)
        : ({ ok: true, value: "2026-09-23T12:00:00Z" } as const);
    });
    expect(await submitAttempt(fake, ATTEMPT, STUDENT)).toEqual({ ok: true });
    expect(fake.recorded.map((input) => [input.revision, input.score.total])).toEqual([
      [3, 0],
      [4, 1],
    ]);
  });

  it("gives up after a few races rather than looping", async () => {
    const fake = store({ record: vi.fn(async () => ({ ok: false, refusal: "changed" }) as const) });
    expect(await submitAttempt(fake, ATTEMPT, STUDENT)).toEqual({ ok: false, refusal: "changed" });
    expect(fake.record).toHaveBeenCalledTimes(3);
  });

  it("treats an attempt already submitted as submitted, whether begin or record says so", async () => {
    const early = store({
      begin: vi.fn(async () => ({ ok: false, refusal: "already_submitted" }) as const),
    });
    expect(await submitAttempt(early, ATTEMPT, STUDENT)).toEqual({ ok: true });
    expect(early.record).not.toHaveBeenCalled();

    const late = store({
      record: vi.fn(async () => ({ ok: false, refusal: "already_submitted" }) as const),
    });
    expect(await submitAttempt(late, ATTEMPT, STUDENT)).toEqual({ ok: true });
  });

  it("passes on every other refusal and a failed read", async () => {
    const closed = store({ begin: vi.fn(async () => ({ ok: false, refusal: "closed" }) as const) });
    expect(await submitAttempt(closed, ATTEMPT, STUDENT)).toEqual({ ok: false, refusal: "closed" });

    const unread = store({ items: vi.fn(async () => null) });
    expect(await submitAttempt(unread, ATTEMPT, STUDENT)).toEqual({ ok: false, refusal: "failed" });
    expect(unread.record).not.toHaveBeenCalled();

    const refused = store({
      record: vi.fn(async () => ({ ok: false, refusal: "not_found" }) as const),
    });
    expect(await submitAttempt(refused, ATTEMPT, STUDENT)).toEqual({
      ok: false,
      refusal: "not_found",
    });
  });
});

describe("autoSubmitExpired", () => {
  const due = (
    attemptId: string,
    assignmentId: string,
    answers: Record<string, unknown>,
  ): ExpiredAttempt => ({
    attemptId,
    studentId: STUDENT,
    assignmentId,
    itemSet: [ROW_MC, ROW_MR],
    revision: 2,
    answers,
  });

  function autoStore(list: ExpiredAttempt[] | null, overrides: Partial<AutoSubmitStore> = {}) {
    const recorded: RecordInput[] = [];
    const fake: AutoSubmitStore = {
      expired: vi.fn(async () => list),
      items: vi.fn(async () => SET),
      record: vi.fn(async (input: RecordInput) => {
        recorded.push(input);
        return { ok: true, value: "2026-09-23T12:00:00Z" } as const;
      }),
      ...overrides,
    };
    return { fake, recorded };
  }

  it("scores exactly what each attempt saved and records it as automatic", async () => {
    const { fake, recorded } = autoStore([
      due("00000000-0000-0000-0000-0000000000a1", "00000000-0000-0000-0000-0000000000b1", {
        [ROW_MC]: { type: "multiple_choice", optionId: "opt_a" },
        [ROW_MR]: { type: "multiple_response", optionIds: ["opt_a", "opt_b", "opt_d"] },
      }),
      due("00000000-0000-0000-0000-0000000000a2", "00000000-0000-0000-0000-0000000000b1", {}),
    ]);
    expect(
      await autoSubmitExpired(fake, { assignmentId: "00000000-0000-0000-0000-0000000000b1" }),
    ).toBe(2);
    expect(fake.expired).toHaveBeenCalledWith({
      assignmentId: "00000000-0000-0000-0000-0000000000b1",
    });
    // One read of the items per assignment, however many attempts are due.
    expect(fake.items).toHaveBeenCalledTimes(1);
    expect(recorded.map((input) => [input.automatic, input.revision, input.score.total])).toEqual([
      [true, 2, 4],
      [true, 2, 0],
    ]);
    expect(recorded[0]?.score.marks.map((mark) => mark.item_id)).toEqual([ROW_MC, ROW_MR]);
  });

  it("is idempotent: an attempt another run already submitted is not counted again", async () => {
    const { fake } = autoStore([due("00000000-0000-0000-0000-0000000000a1", "b", {})], {
      record: vi.fn(async () => ({ ok: false, refusal: "already_submitted" }) as const),
    });
    expect(await autoSubmitExpired(fake)).toBe(0);
  });

  it("leaves an attempt open when its items cannot be read, and does nothing on a failed list", async () => {
    const unreadable = autoStore([due("00000000-0000-0000-0000-0000000000a1", "b", {})], {
      items: vi.fn(async () => null),
    });
    expect(await autoSubmitExpired(unreadable.fake)).toBe(0);
    expect(unreadable.fake.record).not.toHaveBeenCalled();

    const failed = autoStore(null);
    expect(await autoSubmitExpired(failed.fake)).toBe(0);
  });
});
