import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server-side author check (#204). A new account starts with no role, so a signed-in account with no
 * role is the ordinary case, not an edge: it must be refused here even though RLS would show it
 * nothing anyway, so the UI agrees with the database.
 */

let claims: Record<string, unknown> | null;
let profile: { org_id: string | null; role: string | null } | null;

/** What `workspace_access()` answers (#521); only read when billing is enforced. */
let accessRow: Record<string, unknown> | null;
let accessError: { code: string } | null;
const rpc = vi.fn(async () => ({
  data: accessError ? null : accessRow ? [accessRow] : [],
  error: accessError,
}));

const client = {
  rpc,
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
  accessRow = null;
  accessError = null;
  rpc.mockClear();
  redirected.mockClear();
  vi.unstubAllEnvs();
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
  it("sends an account with no role to the welcome page (#362)", async () => {
    profile = { org_id: null, role: null };
    await expect(requireAuthor("/author")).rejects.toThrow("redirect:/welcome");
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

describe("authorForRoute: the read-only state (#521)", () => {
  const lapsed = {
    has_access: false,
    source: "none",
    grant_kind: null,
    status: null,
    trial_end: null,
    current_period_end: null,
    cancel_at_period_end: null,
    is_founder: true,
  };

  it("reads nothing and is never read-only while BILLING_ENFORCED is unset", async () => {
    accessRow = lapsed;
    expect(await authorForRoute()).toMatchObject({ status: "ok", readOnly: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["false", "1", "TRUE"])("is not enforced by BILLING_ENFORCED=%s", async (value) => {
    vi.stubEnv("BILLING_ENFORCED", value);
    accessRow = lapsed;
    expect(await authorForRoute()).toMatchObject({ status: "ok", readOnly: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is read-only for the person who started a lapsed workspace, who may subscribe", async () => {
    vi.stubEnv("BILLING_ENFORCED", "true");
    accessRow = lapsed;
    expect(await authorForRoute()).toMatchObject({
      status: "ok",
      readOnly: { readOnly: true, canManage: true },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("workspace_access");
  });

  it("is read-only for another teacher of a lapsed workspace, who must ask", async () => {
    vi.stubEnv("BILLING_ENFORCED", "true");
    accessRow = { ...lapsed, is_founder: false };
    expect(await authorForRoute()).toMatchObject({
      readOnly: { readOnly: true, canManage: false },
    });
  });

  it("is not read-only when enforced and the workspace has access", async () => {
    vi.stubEnv("BILLING_ENFORCED", "true");
    accessRow = { ...lapsed, has_access: true, source: "grant", grant_kind: "beta" };
    expect(await authorForRoute()).toMatchObject({ status: "ok", readOnly: null });
  });

  it("leaves a failed read to the database rather than refusing every teacher", async () => {
    vi.stubEnv("BILLING_ENFORCED", "true");
    accessError = { code: "PGRST202" };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await authorForRoute()).toMatchObject({ status: "ok", readOnly: null });
    logged.mockRestore();
  });

  it("never reads billing for a student or a signed-out visitor", async () => {
    vi.stubEnv("BILLING_ENFORCED", "true");
    profile = { org_id: ORG, role: "student" };
    await authorForRoute();
    claims = null;
    await authorForRoute();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("hands requireAuthor's caller the same state, so a write gate reads nothing more", async () => {
    vi.stubEnv("BILLING_ENFORCED", "true");
    accessRow = lapsed;
    expect(await requireAuthor("/author")).toMatchObject({
      readOnly: { readOnly: true, canManage: true },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
