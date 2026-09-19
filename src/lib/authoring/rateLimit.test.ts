import { describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_ERRORS, RATE_LIMITED_ACTIONS, checkRateLimit } from "./rateLimit";

function fakeClient(result: { data: unknown; error: { code?: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as never, rpc };
}

describe("checkRateLimit", () => {
  it("counts the call against the signed-in user's limit for that action", async () => {
    const fake = fakeClient({ data: true, error: null });
    expect(await checkRateLimit(fake.client, "publish")).toEqual({ ok: true });
    expect(fake.rpc).toHaveBeenCalledWith("take_rate_limit", { action_name: "publish" });
  });

  it("says plainly to wait when the user is over the limit", async () => {
    const fake = fakeClient({ data: false, error: null });
    expect(await checkRateLimit(fake.client, "save")).toEqual({
      ok: false,
      error: RATE_LIMIT_ERRORS.limited,
    });
    expect(RATE_LIMIT_ERRORS.limited).toBe(
      "You are doing that too often. Wait a minute, then try again.",
    );
  });

  it("refuses when the limit cannot be checked, rather than skipping it", async () => {
    const fake = fakeClient({ data: null, error: { code: "PGRST202" } });
    expect(await checkRateLimit(fake.client, "import")).toEqual({
      ok: false,
      error: RATE_LIMIT_ERRORS.unchecked,
    });
  });

  it("covers saving, publishing, importing and step changes", () => {
    expect(RATE_LIMITED_ACTIONS).toEqual(["save", "publish", "import", "step"]);
  });
});
