import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const verifyOtp = vi.fn(async () => ({ error: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp } }),
}));

const { confirmSignIn } = await import("./actions");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => vi.clearAllMocks());

describe("confirmSignIn (#305)", () => {
  it("verifies the posted token hash, then follows the safe next", async () => {
    await expect(
      confirmSignIn(form({ token_hash: "abc", type: "email", next: "/learn" })),
    ).rejects.toThrow("redirect:/learn");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
  });

  it("sends a spent or expired link to sign-in with a generic reason", async () => {
    verifyOtp.mockResolvedValueOnce({ error: new Error("Token has expired") });
    await expect(
      confirmSignIn(form({ token_hash: "old", type: "email", next: "/learn" })),
    ).rejects.toThrow("redirect:/sign-in?error=link&next=%2Flearn");
  });

  it("never reaches Supabase for a post without a token", async () => {
    await expect(confirmSignIn(form({ type: "email", next: "/learn" }))).rejects.toThrow(
      "redirect:/sign-in?error=link&next=%2Flearn",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
