import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCaseStudy, sampleEhr } from "@/lib/ngn/fixtures";
import {
  forgetSessionRecords,
  readCachedSessionRecord,
  readSessionRecord,
  readSessionRecords,
} from "./sessionRecord";

type Reply = { data?: unknown; error?: { code?: string } | null };
type Client = Parameters<typeof readSessionRecord>[0];

function fakeRow(reply: Reply) {
  const maybeSingle = vi.fn(async () => reply);
  const eq = vi.fn<(column: string, value: string) => { maybeSingle: typeof maybeSingle }>(() => ({
    maybeSingle,
  }));
  const select = vi.fn<(columns: string) => { eq: typeof eq }>(() => ({ eq }));
  const from = vi.fn<(table: string) => { select: typeof select }>(() => ({ select }));
  return { client: { from } as unknown as Client, from, select, eq };
}

const SESSION = "00000000-0000-4000-8000-0000000000a1";

/** Every answer-bearing string the sample case study's six steps hold, for the negative checks. */
function answerBearingText(): string {
  return JSON.stringify(
    sampleCaseStudy.items.map((item) => [item.answerKey, item.rationale, item.scoring]),
  );
}

beforeEach(() => {
  forgetSessionRecords();
});

describe("readSessionRecord (#184)", () => {
  it("reads the snapshotted record, and selects that one column and nothing else", async () => {
    const fake = fakeRow({ data: { patient_record: sampleEhr }, error: null });

    expect(await readSessionRecord(fake.client, SESSION)).toEqual(sampleEhr);
    expect(fake.from).toHaveBeenCalledWith("sessions");
    // Not the item set, not a key: the record columns and nothing else.
    expect(fake.select).toHaveBeenCalledWith("patient_record, case_study_records");
    expect(fake.eq).toHaveBeenCalledWith("id", SESSION);
  });

  it("hands a phone a record that carries no step's key, rationale or scoring", async () => {
    const fake = fakeRow({ data: { patient_record: sampleEhr }, error: null });
    const bytes = JSON.stringify(await readSessionRecord(fake.client, SESSION));

    // The control: the case study itself does carry them, so the check below has teeth.
    const firstKey = JSON.stringify(sampleCaseStudy.items[0]?.answerKey);
    expect(answerBearingText()).toContain(firstKey);
    expect(bytes).not.toContain(firstKey);
    expect(bytes).not.toContain("answerKey");
    expect(bytes).not.toContain("rationale");
    expect(bytes).toContain("Orthopedic unit");
  });

  it("drops anything the record schema does not know rather than passing it through", async () => {
    const fake = fakeRow({
      data: { patient_record: { ...sampleEhr, answerKey: { leaked: true } } },
      error: null,
    });
    const record = await readSessionRecord(fake.client, SESSION);
    expect(record).not.toBeNull();
    expect(JSON.stringify(record)).not.toContain("leaked");
  });

  it("is null for a bank session, an unreadable record, a missing row and a failed read", async () => {
    expect(
      await readSessionRecord(fakeRow({ data: { patient_record: null } }).client, SESSION),
    ).toBe(null);
    forgetSessionRecords();
    expect(
      await readSessionRecord(fakeRow({ data: { patient_record: { tabs: [] } } }).client, SESSION),
    ).toBeNull();
    forgetSessionRecords();
    expect(
      await readSessionRecord(fakeRow({ data: null, error: null }).client, SESSION),
    ).toBeNull();
    expect(
      await readSessionRecord(fakeRow({ error: { code: "42501" } }).client, SESSION),
    ).toBeNull();
  });
});

describe("readCachedSessionRecord (#335)", () => {
  it("reads a room's record once per process, a bank room's null as well", async () => {
    const staged = fakeRow({ data: { patient_record: sampleEhr }, error: null });
    await readCachedSessionRecord(staged.client, SESSION);
    const again = await readCachedSessionRecord(staged.client, SESSION);
    expect(again).toEqual({ ok: true, record: sampleEhr, runs: [], found: true });
    expect(staged.from).toHaveBeenCalledTimes(1);

    const bank = fakeRow({ data: { patient_record: null }, error: null });
    const BANK = "00000000-0000-4000-8000-0000000000b2";
    await readCachedSessionRecord(bank.client, BANK);
    await readCachedSessionRecord(bank.client, BANK);
    expect(bank.from).toHaveBeenCalledTimes(1);
  });

  it("asks again after a failed read or a row that was not there", async () => {
    const failed = fakeRow({ error: { code: "08000" } });
    expect((await readCachedSessionRecord(failed.client, SESSION)).ok).toBe(false);
    await readCachedSessionRecord(failed.client, SESSION);
    expect(failed.from).toHaveBeenCalledTimes(2);

    const missing = fakeRow({ data: null, error: null });
    await readCachedSessionRecord(missing.client, SESSION);
    await readCachedSessionRecord(missing.client, SESSION);
    expect(missing.from).toHaveBeenCalledTimes(2);
  });
});

describe("readSessionRecords (#469)", () => {
  const CASE = "00000000-0000-4000-8000-0000000000c1";
  const stored = {
    case_study_id: CASE,
    title: "Hip",
    first_position: 3,
    step_count: 6,
    record: { ...sampleEhr, answerKey: { leaked: true } },
  };

  it("reads each case study a quiz session plays, with its record parsed", async () => {
    const fake = fakeRow({ data: { patient_record: null, case_study_records: [stored] } });
    const records = await readSessionRecords(fake.client, SESSION);
    expect(records.record).toBeNull();
    expect(records.runs).toEqual([
      { caseStudyId: CASE, title: "Hip", firstPosition: 3, stepCount: 6, record: sampleEhr },
    ]);
    expect(JSON.stringify(records)).not.toContain("leaked");
  });

  it("is nothing at all for a failed read", async () => {
    const fake = fakeRow({ error: { code: "08000" } });
    expect(await readSessionRecords(fake.client, SESSION)).toEqual({ record: null, runs: [] });
  });

  it("reads the one record alone from a database without the column yet", async () => {
    const maybeSingle = vi.fn(async () => ({ data: { patient_record: sampleEhr }, error: null }));
    const select = vi.fn((columns: string) => ({
      eq: () => ({
        maybeSingle:
          columns === "patient_record"
            ? maybeSingle
            : async () => ({ data: null, error: { code: "42703" }, status: 400 }),
      }),
    }));
    const client = { from: () => ({ select }) } as unknown as Client;

    expect(await readSessionRecords(client, SESSION)).toEqual({ record: sampleEhr, runs: [] });
    expect(select.mock.calls.map(([columns]) => columns)).toEqual([
      "patient_record, case_study_records",
      "patient_record",
    ]);
  });
});
