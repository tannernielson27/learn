import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims } }),
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
});
