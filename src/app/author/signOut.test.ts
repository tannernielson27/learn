import { beforeEach, describe, expect, it, vi } from "vitest";
import { PARTICIPANT_COOKIE } from "@/lib/live/participantToken";

/**
 * Sign out is the one control on a shared laptop that says "the next person is someone else"
 * (ADR 0013). The live session cookie is not a Supabase cookie, so signing out of Supabase alone
 * left it behind, and a participant linked to the account that just left with it.
 */

const deletedCookies = vi.fn<(name: string) => void>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: deletedCookies }),
}));

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signOut } }),
}));

const actions = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signOut", () => {
  it("signs this browser out and goes to sign in", async () => {
    await expect(actions.signOut()).rejects.toThrow("redirect:/sign-in");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("clears the live session participant, so the next person cannot continue as them", async () => {
    await expect(actions.signOut()).rejects.toThrow(/^redirect:/);
    expect(deletedCookies).toHaveBeenCalledWith(PARTICIPANT_COOKIE);
  });
});
