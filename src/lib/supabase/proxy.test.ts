import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const from = vi.fn(() => ({ select: () => ({ eq }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims }, from }),
}));

const { updateSession } = await import("./proxy");

const request = () => new NextRequest("https://learn.example/author");

describe("updateSession", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_example");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    getClaims.mockReset();
    maybeSingle.mockReset();
    from.mockClear();
    eq.mockClear();
  });

  it("reports a verified session as signed in", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    await expect(updateSession(request())).resolves.toMatchObject({ signedIn: true });
  });

  it("reports no claims as signed out", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("no session") });
    await expect(updateSession(request())).resolves.toMatchObject({ signedIn: false });
  });

  it("treats a failing auth service as signed out instead of failing the request", async () => {
    getClaims.mockRejectedValue(new Error("fetch failed"));
    await expect(updateSession(request())).resolves.toMatchObject({ signedIn: false });
  });

  it("treats missing configuration as signed out", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(updateSession(request())).resolves.toMatchObject({ signedIn: false });
    expect(getClaims).not.toHaveBeenCalled();
  });

  describe("homeFor", () => {
    it("reads nothing until it is asked, so an ordinary request costs no query", async () => {
      getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
      await updateSession(request());
      expect(from).not.toHaveBeenCalled();
    });

    it("swaps the default for the home of the account the token names", async () => {
      getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
      maybeSingle.mockResolvedValue({ data: { role: "student" }, error: null });
      const { homeFor } = await updateSession(request());
      await expect(homeFor("/author")).resolves.toBe("/learn");
      expect(from).toHaveBeenCalledWith("profiles");
      expect(eq).toHaveBeenCalledWith("id", "user-1");
      // The token was verified once, by `updateSession` itself.
      expect(getClaims).toHaveBeenCalledOnce();
    });

    it("leaves a path that was asked for alone, without a query", async () => {
      getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
      const { homeFor } = await updateSession(request());
      await expect(homeFor("/author/banks/1")).resolves.toBe("/author/banks/1");
      expect(from).not.toHaveBeenCalled();
    });

    it("changes nothing for a signed-out request, and reads nothing", async () => {
      getClaims.mockResolvedValue({ data: null, error: new Error("no session") });
      const signedOut = await updateSession(request());
      await expect(signedOut.homeFor("/author")).resolves.toBe("/author");

      getClaims.mockRejectedValue(new Error("fetch failed"));
      const outage = await updateSession(request());
      await expect(outage.homeFor("/author")).resolves.toBe("/author");

      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      const unconfigured = await updateSession(request());
      await expect(unconfigured.homeFor("/author")).resolves.toBe("/author");
      expect(from).not.toHaveBeenCalled();
    });
  });
});
