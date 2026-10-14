import { describe, expect, it, vi } from "vitest";

const handleWorkspaceSweep = vi.fn(async () => new Response(null, { status: 204 }));
vi.mock("@/lib/workspaceSweep/sweepRoute", () => ({
  handleWorkspaceSweep: (...args: unknown[]) => handleWorkspaceSweep(...(args as [])),
}));
vi.mock("@/lib/workspaceSweep/sweepDeps", () => ({ workspaceSweepDeps: () => "deps" }));

const route = await import("./route");

describe("/api/cron/workspace-sweep", () => {
  it("answers POST only, so no GET, prefetch or crawler can start a run", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "maxDuration"]);
  });

  it("hands the request to the handler with the real dependencies", async () => {
    const request = new Request("https://learn.example/api/cron/workspace-sweep", {
      method: "POST",
    });
    const response = await route.POST(request);
    expect(response.status).toBe(204);
    expect(handleWorkspaceSweep).toHaveBeenCalledWith(request, "deps");
  });
});
