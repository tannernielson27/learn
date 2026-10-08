import { beforeEach, describe, expect, it, vi } from "vitest";

/** Joining a class by its typed code (#362), from the student home and the welcome page. */

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

type RpcReply = { data: unknown; error: { code?: string } | null };
const rpc = vi.fn<(name: string, args?: Record<string, unknown>) => Promise<RpcReply>>(
  async () => ({
    data: "joined",
    error: null,
  }),
);
let viewer: Record<string, unknown>;
vi.mock("@/lib/classes/viewer", () => ({ readViewer: async () => viewer }));

const { joinClassWithCode, markStudentOnboarded } = await import("./actions");

const IDLE = { status: "idle" } as const;

function form(code: string | null): FormData {
  const data = new FormData();
  if (code !== null) data.set("code", code);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  viewer = { status: "signed_in", userId: "user-1", role: null, supabase: { rpc } };
});

describe("joinClassWithCode (#362)", () => {
  it("joins as the signed-in account and goes to the student home", async () => {
    await expect(joinClassWithCode(IDLE, form("abcd-2345"))).rejects.toThrow("redirect:/learn");
    expect(rpc).toHaveBeenCalledWith("join_class_by_code", { p_code: "ABCD2345" });
  });

  it("treats a class the student is already in as joined", async () => {
    viewer = { ...viewer, role: "student" };
    await expect(joinClassWithCode(IDLE, form("ABCD 2345"))).rejects.toThrow("redirect:/learn");
  });

  it("refuses a signed-out call before the database is asked", async () => {
    viewer = { status: "signed_out" };
    await expect(joinClassWithCode(IDLE, form("ABCD2345"))).rejects.toThrow(
      "redirect:/sign-in?next=%2Fwelcome",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([null, "", "   ", "ABC", "ABCD-234", "ABCD-23450", "ABCD-234O", "<script>"])(
    "asks for a whole code when given %j, without spending a try",
    async (typed) => {
      const state = await joinClassWithCode(IDLE, form(typed));
      expect(state).toEqual({
        status: "error",
        error: "Enter the eight letters and numbers of your class code, like ABCD-2345.",
      });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("says a code did not work the same way for a wrong code and a class the student was removed from", async () => {
    rpc.mockResolvedValueOnce({ data: "invalid", error: null });
    expect(await joinClassWithCode(IDLE, form("ABCD2345"))).toEqual({
      status: "error",
      error:
        "That class code did not work. Check it with your instructor. If you were removed from the class, only they can add you back.",
    });
    expect(redirected).not.toHaveBeenCalled();
  });

  it("tells an instructor the account stays an instructor", async () => {
    rpc.mockResolvedValueOnce({ data: "instructor", error: null });
    expect(await joinClassWithCode(IDLE, form("ABCD2345"))).toEqual({ status: "instructor" });
  });

  it("says to wait when the account has tried too many codes", async () => {
    rpc.mockResolvedValueOnce({ data: "rate_limited", error: null });
    expect(await joinClassWithCode(IDLE, form("ABCD2345"))).toEqual({
      status: "error",
      error: "Too many class codes tried. Wait a few minutes, then try again.",
    });
  });

  it("fails closed when the database cannot answer", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "08006" } });
    expect(await joinClassWithCode(IDLE, form("ABCD2345"))).toEqual({
      status: "error",
      error: "Joining is not working just now. Try again in a moment.",
    });
  });
});

describe("markStudentOnboarded (#365)", () => {
  it("stamps the caller's own profile through mark_onboarded, which takes no argument", async () => {
    rpc.mockResolvedValueOnce({ data: "2026-10-09T12:00:00Z", error: null });
    await markStudentOnboarded();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mark_onboarded");
    expect(revalidatePath).toHaveBeenCalledWith("/learn");
  });

  it("does nothing for a signed-out call", async () => {
    viewer = { status: "signed_out" };
    await expect(markStudentOnboarded()).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never throws when the stamp fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { code: "08006" } });
    await expect(markStudentOnboarded()).resolves.toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
