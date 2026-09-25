import { describe, expect, it, vi } from "vitest";
import {
  listBankShares,
  listClassShares,
  listSharedClassNamesByBank,
  readPracticeExposure,
  sharePractice,
  stopPractice,
} from "./practiceShares";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
type Client = Parameters<typeof listBankShares>[0];

const BANK = "00000000-0000-4000-8000-0000000000e0";
const OTHER_BANK = "00000000-0000-4000-8000-0000000000e1";
const CLASS = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CLASS = "00000000-0000-4000-8000-0000000000c2";
const AT = "2026-09-24T12:00:00+00:00";

/** A query builder whose every step returns itself and which resolves to `reply` when awaited. */
function fakeQuery(reply: Reply) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const step of ["select", "insert", "delete", "eq", "order", "limit"]) {
    builder[step] = (...args: unknown[]) => {
      calls.push([step, args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: Reply) => unknown) => resolve(reply);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as Client, from, calls };
}

function fakeRpc(reply: Reply) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as Client, rpc };
}

describe("listBankShares", () => {
  it("lists the classes a bank is shared with, by class name", async () => {
    const fake = fakeQuery({
      data: [
        { class_id: OTHER_CLASS, shared_at: AT, classes: { name: "NUR 320" } },
        { class_id: CLASS, shared_at: AT, classes: { name: "NUR 310" } },
      ],
      error: null,
    });
    expect(await listBankShares(fake.client, BANK)).toEqual([
      { id: CLASS, name: "NUR 310", sharedAt: AT },
      { id: OTHER_CLASS, name: "NUR 320", sharedAt: AT },
    ]);
    expect(fake.from).toHaveBeenCalledWith("bank_practice_shares");
    expect(fake.calls).toContainEqual(["eq", ["bank_id", BANK]]);
  });

  it("returns null when the shares cannot be read", async () => {
    expect(await listBankShares(fakeQuery({ data: null, error: { code: "x" } }).client, BANK)).toBe(
      null,
    );
  });

  it("leaves out a row whose class it cannot read", async () => {
    const fake = fakeQuery({ data: [{ class_id: CLASS, shared_at: AT, classes: null }] });
    expect(await listBankShares(fake.client, BANK)).toEqual([]);
  });
});

describe("listClassShares", () => {
  it("lists the banks shared with a class, by bank name", async () => {
    const fake = fakeQuery({
      data: [
        { bank_id: OTHER_BANK, shared_at: AT, item_banks: { name: "Renal week" } },
        { bank_id: BANK, shared_at: AT, item_banks: { name: "Cardiac week" } },
      ],
    });
    expect(await listClassShares(fake.client, CLASS)).toEqual([
      { id: BANK, name: "Cardiac week", sharedAt: AT },
      { id: OTHER_BANK, name: "Renal week", sharedAt: AT },
    ]);
    expect(fake.calls).toContainEqual(["eq", ["class_id", CLASS]]);
  });

  it("returns null when the shares cannot be read", async () => {
    expect(await listClassShares(fakeQuery({ error: { code: "x" } }).client, CLASS)).toBeNull();
  });
});

describe("listSharedClassNamesByBank", () => {
  it("groups the org's shares by bank in one read, class names sorted", async () => {
    const fake = fakeQuery({
      data: [
        { bank_id: BANK, classes: { name: "NUR 320" } },
        { bank_id: OTHER_BANK, classes: { name: "NUR 310" } },
        { bank_id: BANK, classes: { name: "NUR 310" } },
        { bank_id: BANK, classes: null },
      ],
    });
    const byBank = await listSharedClassNamesByBank(fake.client);
    expect(byBank.get(BANK)).toEqual(["NUR 310", "NUR 320"]);
    expect(byBank.get(OTHER_BANK)).toEqual(["NUR 310"]);
    expect(fake.from).toHaveBeenCalledTimes(1);
  });

  it("shows no badges when the shares cannot be read, rather than failing the list", async () => {
    const byBank = await listSharedClassNamesByBank(fakeQuery({ error: { code: "x" } }).client);
    expect(byBank.size).toBe(0);
  });
});

describe("sharePractice", () => {
  it("inserts the bank and the class only; the org and the sharer come from the database", async () => {
    const fake = fakeQuery({ error: null });
    expect(await sharePractice(fake.client, BANK, CLASS)).toEqual({ ok: true });
    expect(fake.calls).toContainEqual(["insert", [{ bank_id: BANK, class_id: CLASS }]]);
  });

  it("treats an existing share as shared", async () => {
    expect(
      await sharePractice(fakeQuery({ error: { code: "23505" } }).client, BANK, CLASS),
    ).toEqual({ ok: true });
  });

  it("maps the database's refusals", async () => {
    const refusal = async (code: string) =>
      sharePractice(fakeQuery({ error: { code } }).client, BANK, CLASS);
    expect(await refusal("23503")).toEqual({ ok: false, reason: "gone" });
    expect(await refusal("42501")).toEqual({ ok: false, reason: "gone" });
    expect(await refusal("54000")).toEqual({ ok: false, reason: "rate_limited" });
    expect(await refusal("XX000")).toEqual({ ok: false, reason: "failed" });
  });
});

describe("stopPractice", () => {
  it("deletes the one share", async () => {
    const fake = fakeQuery({ data: [{ id: "x" }], error: null });
    expect(await stopPractice(fake.client, BANK, CLASS)).toEqual({ ok: true, changed: true });
    expect(fake.calls).toContainEqual(["eq", ["bank_id", BANK]]);
    expect(fake.calls).toContainEqual(["eq", ["class_id", CLASS]]);
  });

  it("tells a share already stopped from a delete that failed", async () => {
    expect(await stopPractice(fakeQuery({ data: [] }).client, BANK, CLASS)).toEqual({
      ok: true,
      changed: false,
    });
    expect(await stopPractice(fakeQuery({ error: { code: "08006" } }).client, BANK, CLASS)).toEqual(
      { ok: false, code: "08006" },
    );
  });
});

describe("readPracticeExposure", () => {
  it("asks about a bank and collects the class names in one call", async () => {
    const fake = fakeRpc({
      data: [
        { class_id: CLASS, class_name: "NUR 205", exposed_items: 4 },
        { class_id: OTHER_CLASS, class_name: "NUR 310", exposed_items: 4 },
      ],
    });
    expect(await readPracticeExposure(fake.client, { kind: "bank", id: BANK })).toEqual({
      classNames: ["NUR 205", "NUR 310"],
      exposedItems: 4,
    });
    expect(fake.rpc).toHaveBeenCalledWith("practice_exposure", { source_bank: BANK });
  });

  it("asks about a case study by its own id", async () => {
    const fake = fakeRpc({ data: [] });
    expect(await readPracticeExposure(fake.client, { kind: "case_study", id: BANK })).toEqual({
      classNames: [],
      exposedItems: 0,
    });
    expect(fake.rpc).toHaveBeenCalledWith("practice_exposure", { source_case_study: BANK });
  });

  it("returns null when it cannot tell", async () => {
    expect(
      await readPracticeExposure(fakeRpc({ error: { code: "x" } }).client, {
        kind: "bank",
        id: BANK,
      }),
    ).toBeNull();
  });
});
