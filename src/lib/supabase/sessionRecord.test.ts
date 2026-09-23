import { describe, expect, it, vi } from "vitest";
import { sampleCaseStudy, sampleEhr } from "@/lib/ngn/fixtures";
import { readSessionRecord } from "./sessionRecord";

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

describe("readSessionRecord (#184)", () => {
  it("reads the snapshotted record, and selects that one column and nothing else", async () => {
    const fake = fakeRow({ data: { patient_record: sampleEhr }, error: null });

    expect(await readSessionRecord(fake.client, SESSION)).toEqual(sampleEhr);
    expect(fake.from).toHaveBeenCalledWith("sessions");
    // Not the item set, not a key: the one column the phone is about to show.
    expect(fake.select).toHaveBeenCalledWith("patient_record");
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
    expect(
      await readSessionRecord(fakeRow({ data: { patient_record: { tabs: [] } } }).client, SESSION),
    ).toBeNull();
    expect(
      await readSessionRecord(fakeRow({ data: null, error: null }).client, SESSION),
    ).toBeNull();
    expect(
      await readSessionRecord(fakeRow({ error: { code: "42501" } }).client, SESSION),
    ).toBeNull();
  });
});
