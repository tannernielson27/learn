import { beforeEach, describe, expect, it, vi } from "vitest";

/** Recording that the teacher welcome was seen (#364). */

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

type RpcReply = { data: unknown; error: { code?: string } | null };
const rpc = vi.fn<(name: string) => Promise<RpcReply>>(async () => ({
  data: "2026-10-08T12:00:00Z",
  error: null,
}));
const AUTHOR = { supabase: { rpc }, orgId: "org-1", userId: "user-1", email: "ada@school.edu" };
const requireAuthor = vi.fn<(returnTo: string) => Promise<typeof AUTHOR>>(async () => AUTHOR);
vi.mock("@/lib/authoring/session", () => ({ requireAuthor }));

const { markOnboarded } = await import("./onboardingActions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("markOnboarded (#364)", () => {
  it("stamps the caller's own profile through mark_onboarded, which takes no argument", async () => {
    await markOnboarded();
    expect(requireAuthor).toHaveBeenCalledWith("/author");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mark_onboarded");
    expect(revalidatePath).toHaveBeenCalledWith("/author");
  });

  it("is refused for anyone who is not an author, before the database is asked", async () => {
    requireAuthor.mockRejectedValueOnce(new Error("redirect:/welcome"));
    await expect(markOnboarded()).rejects.toThrow("redirect:/welcome");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never throws when the stamp fails, and logs no address", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { code: "08006" } });
    await expect(markOnboarded()).resolves.toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain("ada@school.edu");
    error.mockRestore();
  });
});
