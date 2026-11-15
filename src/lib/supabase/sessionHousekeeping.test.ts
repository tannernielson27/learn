import { describe, expect, it } from "vitest";
import {
  checkSessionTitle,
  HOUSEKEEPING_ERRORS,
  renameSession,
  SESSION_TITLE_MAX,
  setSessionsArchived,
} from "./sessionHousekeeping";

type Client = Parameters<typeof renameSession>[0];
type Call = { method: string; args: unknown[] };

/** A query builder that records its calls and answers every one with `reply` once awaited. */
function fakeClient(reply: { data: unknown; error: { code?: string; message: string } | null }) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "update", "eq", "in", "select"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve(reply);
  return { client: chain as unknown as Client, calls };
}

describe("checkSessionTitle (#565)", () => {
  it("trims and folds spaces", () => {
    expect(checkSessionTitle("  Cardiac   review ")).toEqual({ ok: true, title: "Cardiac review" });
  });

  it("refuses an empty or over-long name", () => {
    expect(checkSessionTitle("   ")).toEqual({ ok: false, error: HOUSEKEEPING_ERRORS.emptyTitle });
    expect(checkSessionTitle("x".repeat(SESSION_TITLE_MAX + 1))).toEqual({
      ok: false,
      error: HOUSEKEEPING_ERRORS.longTitle,
    });
  });
});

describe("renameSession", () => {
  it("writes only the title, cleaned", async () => {
    const fake = fakeClient({ data: [{ id: "s1" }], error: null });
    expect(await renameSession(fake.client, "s1", " New  name ")).toEqual({ ok: true, count: 1 });
    expect(fake.calls).toContainEqual({ method: "update", args: [{ title: "New name" }] });
  });

  it("says plainly when the database refuses a teacher who did not run it", async () => {
    const fake = fakeClient({ data: null, error: { code: "42501", message: "nope" } });
    expect(await renameSession(fake.client, "s1", "Name")).toEqual({
      ok: false,
      error: HOUSEKEEPING_ERRORS.notYours,
    });
  });

  it("says the session is gone when no row came back", async () => {
    const fake = fakeClient({ data: [], error: null });
    expect(await renameSession(fake.client, "s1", "Name")).toEqual({
      ok: false,
      error: HOUSEKEEPING_ERRORS.gone,
    });
  });

  it("never reaches the database with a bad name", async () => {
    const fake = fakeClient({ data: [], error: null });
    await renameSession(fake.client, "s1", "");
    expect(fake.calls).toEqual([]);
  });
});

describe("setSessionsArchived", () => {
  it("archives only this host's ended sessions among those asked, and counts them", async () => {
    const fake = fakeClient({ data: [{ id: "a" }, { id: "b" }], error: null });
    expect(await setSessionsArchived(fake.client, "host", ["a", "b", "c"], true)).toEqual({
      ok: true,
      count: 2,
    });
    expect(fake.calls).toEqual(
      expect.arrayContaining([
        { method: "in", args: ["id", ["a", "b", "c"]] },
        { method: "eq", args: ["host_id", "host"] },
        { method: "eq", args: ["status", "ended"] },
      ]),
    );
    const update = fake.calls.find((call) => call.method === "update");
    expect((update?.args[0] as { archived_at: string | null }).archived_at).not.toBeNull();
  });

  it("restores by clearing the archive time", async () => {
    const fake = fakeClient({ data: [{ id: "a" }], error: null });
    await setSessionsArchived(fake.client, "host", ["a"], false);
    expect(fake.calls).toContainEqual({ method: "update", args: [{ archived_at: null }] });
  });

  it("does nothing for an empty selection", async () => {
    const fake = fakeClient({ data: [], error: null });
    expect(await setSessionsArchived(fake.client, "host", [], true)).toEqual({
      ok: true,
      count: 0,
    });
    expect(fake.calls).toEqual([]);
  });
});
