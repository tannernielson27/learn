import { afterEach, describe, expect, it, vi } from "vitest";

const createSupabaseServiceClient = vi.fn(() => "service-client");
const sweepAbandonedWorkspaces = vi.fn(async () => ({ status: "ok", rows: [] }));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => createSupabaseServiceClient(),
}));
vi.mock("@/lib/supabase/workspaceSweep", () => ({
  sweepAbandonedWorkspaces: (...args: unknown[]) => sweepAbandonedWorkspaces(...(args as [])),
}));

const { workspaceSweepDeps } = await import("./sweepDeps");

afterEach(() => {
  vi.unstubAllEnvs();
  createSupabaseServiceClient.mockClear();
  sweepAbandonedWorkspaces.mockClear();
});

describe("workspaceSweepDeps", () => {
  it("reads CRON_SECRET and builds nothing until asked", () => {
    vi.stubEnv("CRON_SECRET", "x".repeat(40));
    const deps = workspaceSweepDeps();
    expect(deps.secret).toBe("x".repeat(40));
    expect(deps.limiter).toBeDefined();
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("has no mode when WORKSPACE_SWEEP is not set", () => {
    vi.stubEnv("WORKSPACE_SWEEP", undefined);
    expect(workspaceSweepDeps().mode).toBeUndefined();
  });

  it("passes WORKSPACE_SWEEP on untouched, so only the exact value deletes", () => {
    vi.stubEnv("WORKSPACE_SWEEP", " delete ");
    expect(workspaceSweepDeps().mode).toBe(" delete ");
    vi.stubEnv("WORKSPACE_SWEEP", "delete");
    expect(workspaceSweepDeps().mode).toBe("delete");
  });

  it("calls the database with the service role, and only when the run asks", async () => {
    const deps = workspaceSweepDeps();
    expect(await deps.sweep({ delete: false, limit: 20 })).toEqual({ status: "ok", rows: [] });
    expect(createSupabaseServiceClient).toHaveBeenCalledTimes(1);
    expect(sweepAbandonedWorkspaces).toHaveBeenCalledWith("service-client", {
      delete: false,
      limit: 20,
    });
  });
});
