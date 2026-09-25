import { describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_ERRORS } from "@/lib/authoring/rateLimit";
import { SAMPLE_BANK_NAME } from "./sampleBank";
import { importSampleBank, SAMPLE_IMPORT_ERRORS } from "./sampleImport";

type Reply = { data: unknown; error: { code?: string } | null };

interface Call {
  table: string;
  steps: { method: string; args: unknown[] }[];
}

/**
 * A chainable stand-in for the Supabase client: each `from()` takes the next reply queued for its
 * table and records every step of the chain, so a test can read what was asked and written.
 */
function fakeClient(tables: Record<string, Reply[]>, rpcs: Record<string, Reply>) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const reply = tables[table]?.shift() ?? { data: null, error: null };
    const call: Call = { table, steps: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "insert", "delete", "eq", "order", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        call.steps.push({ method, args });
        return chain;
      };
    }
    chain.single = async () => reply;
    chain.then = (resolve: (value: Reply) => unknown) => resolve(reply);
    return chain;
  });
  const rpc = vi.fn(async (name: string) => rpcs[name] ?? { data: null, error: null });
  return { client: { from, rpc } as never, from, rpc, calls };
}

const ORG = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-0000000000aa";
const EXISTING = "00000000-0000-4000-8000-0000000000b1";
const CREATED = "00000000-0000-4000-8000-0000000000b2";
const AUTHOR = { orgId: ORG, userId: USER };

const ROOM = { take_rate_limit: { data: true, error: null } };
const IMPORTED = {
  ...ROOM,
  import_sample_bank: { data: { item_ids: ["x"], case_study_id: "y" }, error: null },
};

const step = (call: Call | undefined, method: string) =>
  call?.steps.filter((entry) => entry.method === method).map((entry) => entry.args);

describe("importSampleBank", () => {
  it("makes a Sample bank in the caller's org and fills it, published, in one call", async () => {
    const fake = fakeClient(
      {
        item_banks: [
          { data: [], error: null },
          { data: { id: CREATED }, error: null },
        ],
      },
      IMPORTED,
    );
    expect(await importSampleBank(fake.client, AUTHOR)).toEqual({
      ok: true,
      bankId: CREATED,
      created: true,
    });

    const [lookup, insert] = fake.calls;
    expect(step(lookup, "eq")).toEqual([
      ["org_id", ORG],
      ["name", SAMPLE_BANK_NAME],
    ]);
    expect(step(insert, "insert")).toEqual([
      [{ name: SAMPLE_BANK_NAME, org_id: ORG, created_by: USER }],
    ]);

    // #283: one call writes and publishes the sample; the drafts-only import is not used.
    expect(fake.rpc).not.toHaveBeenCalledWith("import_bank_content", expect.anything());
    const imports = fake.rpc.mock.calls.filter(([name]) => name === "import_sample_bank");
    expect(imports).toHaveLength(1);
    const [, args] = imports[0] as unknown as [string, Record<string, unknown>];
    expect(args.target_bank).toBe(CREATED);
    expect(Array.isArray(args.new_items)).toBe(true);
    expect(args.new_case_study).toMatchObject({ title: expect.any(String) });
  });

  it("links to the org's existing Sample bank instead of making a second", async () => {
    const fake = fakeClient({ item_banks: [{ data: [{ id: EXISTING }], error: null }] }, IMPORTED);
    expect(await importSampleBank(fake.client, AUTHOR)).toEqual({
      ok: true,
      bankId: EXISTING,
      created: false,
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("asks the import limit before writing, and writes nothing when it is spent", async () => {
    const fake = fakeClient(
      { item_banks: [{ data: [], error: null }] },
      { take_rate_limit: { data: false, error: null } },
    );
    expect(await importSampleBank(fake.client, AUTHOR)).toEqual({
      ok: false,
      error: RATE_LIMIT_ERRORS.limited,
    });
    expect(fake.rpc).toHaveBeenCalledWith("take_rate_limit", { action_name: "import" });
    expect(fake.calls.some((call) => step(call, "insert")?.length)).toBe(false);
  });

  it("says so when the lookup fails, and writes nothing", async () => {
    const fake = fakeClient({ item_banks: [{ data: null, error: { code: "08006" } }] }, IMPORTED);
    expect(await importSampleBank(fake.client, AUTHOR)).toEqual({
      ok: false,
      error: SAMPLE_IMPORT_ERRORS.failed,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("says so when the bank cannot be made, and imports nothing", async () => {
    const fake = fakeClient(
      {
        item_banks: [
          { data: [], error: null },
          { data: null, error: { code: "42501" } },
        ],
      },
      IMPORTED,
    );
    expect(await importSampleBank(fake.client, AUTHOR)).toEqual({
      ok: false,
      error: SAMPLE_IMPORT_ERRORS.failed,
    });
    expect(fake.rpc).not.toHaveBeenCalledWith("import_sample_bank", expect.anything());
  });

  it("removes the empty bank when the import is refused, so a retry is not sent to it", async () => {
    const fake = fakeClient(
      {
        item_banks: [
          { data: [], error: null },
          { data: { id: CREATED }, error: null },
          { data: null, error: null },
        ],
      },
      { ...ROOM, import_sample_bank: { data: null, error: { code: "54000" } } },
    );
    expect(await importSampleBank(fake.client, AUTHOR)).toEqual({
      ok: false,
      error: RATE_LIMIT_ERRORS.limited,
    });
    const removal = fake.calls[2];
    expect(step(removal, "delete")).toHaveLength(1);
    expect(step(removal, "eq")).toEqual([
      ["id", CREATED],
      ["org_id", ORG],
    ]);
  });

  it("says the import failed on any other refusal, and removes the empty bank", async () => {
    const fake = fakeClient(
      {
        item_banks: [
          { data: [], error: null },
          { data: { id: CREATED }, error: null },
          { data: null, error: null },
        ],
      },
      { ...ROOM, import_sample_bank: { data: null, error: { code: "22023" } } },
    );
    expect(await importSampleBank(fake.client, AUTHOR)).toEqual({
      ok: false,
      error: SAMPLE_IMPORT_ERRORS.failed,
    });
    expect(step(fake.calls[2], "delete")).toHaveLength(1);
  });
});
