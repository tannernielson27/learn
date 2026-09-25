import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sample import and Hide this (#265), through the real author check: the Supabase client is
 * faked underneath `requireAuthor`, so a student or an account with no role is refused by the same
 * code that refuses them everywhere else, before anything is read or written.
 */

type Reply = { data: unknown; error: { code?: string } | null };

let claims: Record<string, unknown> | null;
let profile: { org_id: string | null; role: string | null } | null;
let bankReplies: Reply[];
const written: { table: string; method: string; args: unknown[] }[] = [];

function chainFor(table: string) {
  const reply: Reply =
    table === "profiles"
      ? { data: profile, error: null }
      : (bankReplies.shift() ?? { data: null, error: null });
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "insert", "delete", "eq", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      if (method === "insert" || method === "delete") written.push({ table, method, args });
      return chain;
    };
  }
  chain.single = async () => reply;
  chain.maybeSingle = async () => reply;
  chain.then = (resolve: (value: Reply) => unknown) => resolve(reply);
  return chain;
}

const rpc = vi.fn(async (name: string) =>
  name === "take_rate_limit"
    ? { data: true, error: null }
    : { data: { item_ids: [], case_study_id: null }, error: null },
);
const client = {
  auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
  from: vi.fn((table: string) => chainFor(table)),
  rpc,
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));
const revalidated = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidated(path) }));

const cookieSets: unknown[][] = [];
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (...args: unknown[]) => cookieSets.push(args) }),
}));

const { hideGetStarted, importSample } = await import("./onboardingActions");
const { GET_STARTED_COOKIE } = await import("@/lib/onboarding/checklist");

const USER = "00000000-0000-4000-8000-0000000000aa";
const ORG = "00000000-0000-4000-8000-000000000001";
const BANK = "00000000-0000-4000-8000-0000000000b2";

beforeEach(() => {
  claims = { sub: USER, email: "person@example.test" };
  profile = { org_id: ORG, role: "instructor" };
  bankReplies = [];
  written.length = 0;
  cookieSets.length = 0;
  rpc.mockClear();
  redirected.mockClear();
  revalidated.mockClear();
});

describe("importSample", () => {
  it("imports into the caller's own org and opens the new bank", async () => {
    bankReplies = [
      { data: [], error: null },
      { data: { id: BANK }, error: null },
    ];
    await expect(importSample()).rejects.toThrow(`redirect:/author/banks/${BANK}`);
    expect(written).toEqual([
      {
        table: "item_banks",
        method: "insert",
        args: [{ name: "Sample bank", org_id: ORG, created_by: USER }],
      },
    ]);
    expect(revalidated).toHaveBeenCalledWith("/author");
  });

  it("opens the existing Sample bank rather than making a second", async () => {
    bankReplies = [{ data: [{ id: BANK }], error: null }];
    await expect(importSample()).rejects.toThrow(`redirect:/author/banks/${BANK}`);
    expect(written).toEqual([]);
    expect(rpc).not.toHaveBeenCalledWith("import_bank_content", expect.anything());
  });

  it("refuses a student, sending them home before anything is read or written", async () => {
    profile = { org_id: ORG, role: "student" };
    await expect(importSample()).rejects.toThrow("redirect:/learn");
    expect(written).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an account with no role", async () => {
    profile = { org_id: null, role: null };
    await expect(importSample()).rejects.toThrow("redirect:/author/no-access");
    expect(written).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    claims = null;
    await expect(importSample()).rejects.toThrow("redirect:/sign-in");
    expect(written).toEqual([]);
  });

  it("answers with an error the form can show when the import fails", async () => {
    bankReplies = [{ data: null, error: { code: "08006" } }];
    expect(await importSample()).toEqual({
      status: "error",
      error: expect.stringMatching(/could not be imported/),
    });
    expect(redirected).not.toHaveBeenCalled();
  });
});

describe("hideGetStarted", () => {
  it("sets this account's cookie on this browser only, scoped to the author pages", async () => {
    await hideGetStarted();
    expect(cookieSets).toHaveLength(1);
    const [name, value, options] = cookieSets[0] as [string, string, Record<string, unknown>];
    expect(name).toBe(GET_STARTED_COOKIE);
    expect(value).toBe(USER);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/author" });
    expect(revalidated).toHaveBeenCalledWith("/author");
  });

  it("refuses a student and sets nothing", async () => {
    profile = { org_id: ORG, role: "student" };
    await expect(hideGetStarted()).rejects.toThrow("redirect:/learn");
    expect(cookieSets).toEqual([]);
  });
});
