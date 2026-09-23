import { beforeEach, describe, expect, it, vi } from "vitest";

let claims: Record<string, unknown> | null;
let profile: { org_id: string | null; role: string | null } | null;

const client = {
  auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
  }),
};

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

const { readViewer, requireStudent } = await import("./viewer");

const USER = "00000000-0000-4000-8000-0000000000d1";
const ORG = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  claims = { sub: USER, email: "nurse@school.edu" };
  profile = { org_id: ORG, role: "student" };
  redirected.mockClear();
});

describe("readViewer", () => {
  it("is signed out without a verified session", async () => {
    claims = null;
    expect(await readViewer()).toEqual({ status: "signed_out" });
  });

  it("reads the role of a signed-in account", async () => {
    expect(await readViewer()).toMatchObject({
      status: "signed_in",
      userId: USER,
      email: "nurse@school.edu",
      role: "student",
    });
  });

  it("reads no role as no role", async () => {
    profile = { org_id: null, role: null };
    expect(await readViewer()).toMatchObject({ status: "signed_in", role: null });
    profile = null;
    expect(await readViewer()).toMatchObject({ status: "signed_in", role: null });
  });
});

describe("requireStudent", () => {
  it("hands a student its session", async () => {
    expect(await requireStudent()).toMatchObject({ userId: USER, email: "nurse@school.edu" });
    expect(redirected).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in, and back to the student home", async () => {
    claims = null;
    await expect(requireStudent()).rejects.toThrow("redirect:/sign-in?next=%2Flearn");
  });

  it.each(["instructor", "admin"])("sends an %s to the author home", async (role) => {
    profile = { org_id: ORG, role };
    await expect(requireStudent()).rejects.toThrow("redirect:/author");
  });

  it("sends an account with no role to No access yet", async () => {
    profile = { org_id: null, role: null };
    await expect(requireStudent()).rejects.toThrow("redirect:/author/no-access");
  });
});
