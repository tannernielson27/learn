import { describe, expect, it, vi } from "vitest";

const reporting = vi.hoisted(() => ({ startClientReporting: vi.fn() }));
vi.mock("@/lib/observability/reportError", () => reporting);

describe("instrumentation-client", () => {
  it("asks for browser reporting once, before hydration, and leaves the DSN check to it", async () => {
    await import("./instrumentation-client");
    expect(reporting.startClientReporting).toHaveBeenCalledTimes(1);
    expect(reporting.startClientReporting).toHaveBeenCalledWith();
  });
});
