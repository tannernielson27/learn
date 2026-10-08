import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const verifyOtp = vi.fn(async () => ({ error: null as unknown }));
let claims: Record<string, unknown> = { sub: "user-1", app_metadata: {} };
const getClaims = vi.fn(async () => ({ data: { claims } }));
const refreshSession = vi.fn(async () => ({ error: null }));
const signOut = vi.fn<(options: { scope: string }) => Promise<{ error: null }>>(async () => ({
  error: null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { verifyOtp, getClaims, refreshSession, signOut },
  }),
}));

const updateUserById = vi.fn<
  (userId: string, attributes: Record<string, unknown>) => Promise<{ error: null }>
>(async () => ({ error: null }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({ auth: { admin: { updateUserById } } }),
}));

const { confirmSignIn } = await import("./actions");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  claims = { sub: "user-1", app_metadata: {} };
});

describe("confirmSignIn (#305)", () => {
  it("verifies the posted token hash, then follows the safe next", async () => {
    await expect(
      confirmSignIn(form({ token_hash: "abc", type: "email", next: "/learn" })),
    ).rejects.toThrow("redirect:/learn");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
    // An account that was never marked unconfirmed is left exactly as it is.
    expect(updateUserById).not.toHaveBeenCalled();
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

describe("confirmSignIn for an account that joined with a password", () => {
  it("marks the address confirmed once the link has worked, and refreshes the token", async () => {
    claims = { sub: "user-9", app_metadata: { learn_email_unconfirmed: true } };
    await expect(
      confirmSignIn(form({ token_hash: "abc", type: "email", next: "/learn" })),
    ).rejects.toThrow("redirect:/learn");
    expect(updateUserById).toHaveBeenCalledWith("user-9", {
      app_metadata: { learn_email_unconfirmed: null },
    });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    // The same browser that made the account: its password and its sessions are left alone.
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("retires the password, signs out the others and asks for a new password when this browser was not signed in to the account", async () => {
    claims = { sub: "user-9", app_metadata: { learn_email_unconfirmed: true } };
    getClaims.mockResolvedValueOnce({ data: { claims: {} } });
    await expect(
      confirmSignIn(form({ token_hash: "abc", type: "email", next: "/learn" })),
    ).rejects.toThrow("redirect:/account/password?next=%2Flearn&confirmed=1");
    expect(updateUserById).toHaveBeenCalledTimes(2);
    expect(updateUserById).toHaveBeenLastCalledWith("user-9", {
      password: expect.stringMatching(/^[A-Za-z0-9_-]{40,72}$/),
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("touches no password for an account that was never marked unconfirmed", async () => {
    getClaims.mockResolvedValueOnce({ data: { claims: {} } });
    await expect(
      confirmSignIn(form({ token_hash: "abc", type: "email", next: "/learn" })),
    ).rejects.toThrow("redirect:/learn");
    expect(updateUserById).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("confirms nothing when the link failed", async () => {
    claims = { sub: "user-9", app_metadata: { learn_email_unconfirmed: true } };
    verifyOtp.mockResolvedValueOnce({ error: new Error("Token has expired") });
    await expect(
      confirmSignIn(form({ token_hash: "old", type: "email", next: "/learn" })),
    ).rejects.toThrow("redirect:/sign-in?error=link&next=%2Flearn");
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
