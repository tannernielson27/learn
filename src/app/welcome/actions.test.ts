import { beforeEach, describe, expect, it, vi } from "vitest";

/** The welcome page's second try at a teacher's workspace (#361). */

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
let viewer: Record<string, unknown>;
vi.mock("@/lib/classes/viewer", () => ({ readViewer: async () => viewer }));

type RpcReply = { data: unknown; error: { code?: string } | null };
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcReply>>(async () => ({
  data: "00000000-0000-4000-8000-00000000000f",
  error: null,
}));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({ rpc }) }));

const { setUpWorkspace } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  viewer = {
    status: "signed_in",
    userId: USER_ID,
    email: "ada@school.edu",
    role: null,
    displayName: "Ada Lovelace",
  };
});

describe("setUpWorkspace (#361)", () => {
  it("makes the workspace for the signed-in account and goes to authoring", async () => {
    await expect(setUpWorkspace()).rejects.toThrow("redirect:/author");
    expect(rpc).toHaveBeenCalledWith("register_instructor", {
      p_user: USER_ID,
      p_workspace: "Ada Lovelace’s workspace",
    });
  });

  it("names the workspace plainly for an account with no name", async () => {
    viewer = { ...viewer, displayName: null };
    await expect(setUpWorkspace()).rejects.toThrow("redirect:/author");
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_workspace: "My workspace" });
  });

  it("sends a signed-out visitor to sign in, and makes nothing", async () => {
    viewer = { status: "signed_out" };
    await expect(setUpWorkspace()).rejects.toThrow("redirect:/sign-in?next=%2Fwelcome");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["student", "/learn"],
    ["instructor", "/author"],
    ["admin", "/author"],
  ])("never touches an account that is already a %s", async (role, home) => {
    viewer = { ...viewer, role };
    await expect(setUpWorkspace()).rejects.toThrow(`redirect:${home}`);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers a failure with a message, and logs no address or name", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    expect(await setUpWorkspace()).toEqual({
      status: "error",
      error: "Your workspace could not be set up just now. Try again in a moment.",
    });
    expect(redirected).not.toHaveBeenCalled();
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("ada@school.edu");
    expect(logged).not.toContain("Ada");
  });

  it("lets the landing page pick a home when a role arrived meanwhile", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23514" } });
    await expect(setUpWorkspace()).rejects.toThrow(/^redirect:\/$/);
  });
});
