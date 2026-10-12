import { describe, expect, it, vi } from "vitest";
import { sweepAbandonedWorkspaces } from "./workspaceSweep";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
type Client = Parameters<typeof sweepAbandonedWorkspaces>[0];

function fakeRpc(reply: Reply) {
  const rpc = vi.fn(async () => ({ error: null, ...reply }));
  return { client: { rpc } as unknown as Client, rpc };
}

const ORG = "00000000-0000-4000-8000-0000000000a1";

describe("sweepAbandonedWorkspaces", () => {
  it("passes the mode and the limit to the database, and maps each row", async () => {
    const fake = fakeRpc({
      data: [
        { org_id: ORG, rule: "memberless", outcome: "would_delete", reason: null },
        { org_id: ORG, rule: "never_used", outcome: "skipped", reason: "locked" },
      ],
    });
    const result = await sweepAbandonedWorkspaces(fake.client, { delete: false, limit: 20 });
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("sweep_abandoned_workspaces", {
      p_delete: false,
      p_limit: 20,
    });
    expect(result).toEqual({
      status: "ok",
      rows: [
        { orgId: ORG, rule: "memberless", outcome: "would_delete", reason: null },
        { orgId: ORG, rule: "never_used", outcome: "skipped", reason: "locked" },
      ],
    });
  });

  it("asks for a deletion only when told to", async () => {
    const fake = fakeRpc({ data: [] });
    await sweepAbandonedWorkspaces(fake.client, { delete: true, limit: 20 });
    expect(fake.rpc).toHaveBeenCalledWith("sweep_abandoned_workspaces", {
      p_delete: true,
      p_limit: 20,
    });
  });

  it("reads no rows as nothing to do", async () => {
    const fake = fakeRpc({ data: null });
    expect(await sweepAbandonedWorkspaces(fake.client, { delete: false, limit: 20 })).toEqual({
      status: "ok",
      rows: [],
    });
  });

  it.each([
    [
      "PGRST202",
      "Could not find the function public.sweep_abandoned_workspaces in the schema cache",
    ],
    ["PGRST202", ""],
    ["42883", "function public.sweep_abandoned_workspaces(boolean, integer) does not exist"],
  ])("says `not_available` when the database has no such function (%s)", async (code, message) => {
    const fake = fakeRpc({ data: null, error: { code, message } });
    expect(await sweepAbandonedWorkspaces(fake.client, { delete: true, limit: 20 })).toEqual({
      status: "not_available",
    });
  });

  it.each([
    "function private.workspace_sweep_rule(uuid) does not exist",
    "function num_nonnulls(timestamp with time zone) does not exist",
    "",
    undefined,
  ])(
    "treats a function missing inside the sweep as a failure, not a quiet 200 (%j)",
    async (message) => {
      const fake = fakeRpc({ data: null, error: { code: "42883", message } });
      await expect(
        sweepAbandonedWorkspaces(fake.client, { delete: true, limit: 20 }),
      ).rejects.toThrow("sweep_abandoned_workspaces: 42883");
    },
  );

  it.each(["42P01", "42703", "PGRST203", "PGRST301", "57014", undefined])(
    "rejects on any other error (%j)",
    async (code) => {
      const fake = fakeRpc({
        data: null,
        error: { code, message: "sweep_abandoned_workspaces went wrong" },
      });
      await expect(
        sweepAbandonedWorkspaces(fake.client, { delete: false, limit: 20 }),
      ).rejects.toThrow(`sweep_abandoned_workspaces: ${code ?? "unknown"}`);
    },
  );

  it("rejects with the function's name and the code, never the message", async () => {
    const fake = fakeRpc({
      data: null,
      error: { code: "57014", message: "canceling statement for ada@school.test" },
    });
    await expect(
      sweepAbandonedWorkspaces(fake.client, { delete: false, limit: 20 }),
    ).rejects.toThrow("sweep_abandoned_workspaces: 57014");
    await expect(
      sweepAbandonedWorkspaces(fake.client, { delete: false, limit: 20 }),
    ).rejects.not.toThrow(/ada@school\.test/);
  });

  it("does not take a refusal of the service role for a missing function", async () => {
    const fake = fakeRpc({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(
      sweepAbandonedWorkspaces(fake.client, { delete: false, limit: 20 }),
    ).rejects.toThrow("sweep_abandoned_workspaces: 42501");
  });
});
