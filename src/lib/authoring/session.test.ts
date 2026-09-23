import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server-side author check (#204). Since sign-up is invite-only, a signed-in account with no
 * role is the ordinary case, not an edge: it must be refused here even though RLS would show it
 * nothing anyway, so the UI agrees with the database.
 */

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

const { authorForRoute, requireAuthor } = await import("./session");

const USER = "00000000-0000-4000-8000-0000000000aa";
const ORG = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  claims = { sub: USER, email: "person@example.test" };
  profile = { org_id: ORG, role: "instructor" };
  redirected.mockClear();
});

describe("authorForRoute", () => {
  it("is signed out without a verified session", async () => {
    claims = null;
    expect(await authorForRoute()).toEqual({ status: "signed_out" });
  });

  it("refuses an account with no role and no org, as every new account now is", async () => {
    profile = { org_id: null, role: null };
    expect(await authorForRoute()).toEqual({ status: "forbidden", role: null });
  });

  it("refuses an account with no profile at all", async () => {
    profile = null;
    expect(await authorForRoute()).toEqual({ status: "forbidden", role: null });
  });

  it("refuses a student, and says it is one so it can be sent to the student home (#205)", async () => {
    profile = { org_id: ORG, role: "student" };
    expect(await authorForRoute()).toEqual({ status: "forbidden", role: "student" });
  });

  it.each(["instructor", "admin"])("lets an %s in with its org", async (role) => {
    profile = { org_id: ORG, role };
    expect(await authorForRoute()).toMatchObject({
      status: "ok",
      userId: USER,
      orgId: ORG,
      email: "person@example.test",
    });
  });
});

describe("requireAuthor", () => {
  it("sends an account with no role to No access yet", async () => {
    profile = { org_id: null, role: null };
    await expect(requireAuthor("/author")).rejects.toThrow("redirect:/author/no-access");
  });

  it("sends a student to the student home, not No access yet (#205)", async () => {
    profile = { org_id: ORG, role: "student" };
    await expect(requireAuthor("/author")).rejects.toThrow("redirect:/learn");
  });

  it("sends a signed-out visitor to sign in, coming back where they were going", async () => {
    claims = null;
    await expect(requireAuthor("/author/banks/x?folder=y")).rejects.toThrow(
      "redirect:/sign-in?next=%2Fauthor%2Fbanks%2Fx%3Ffolder%3Dy",
    );
  });

  it("hands an author its session", async () => {
    expect(await requireAuthor("/author")).toMatchObject({ userId: USER, orgId: ORG });
    expect(redirected).not.toHaveBeenCalled();
  });
});
