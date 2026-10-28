import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #20 of docs/perf-audit.md: the /author and /learn layouts and their pages each asked who is
 * signed in, so one request verified the token twice and read the profile twice. The two now share
 * one verified read per request, through React's `cache`. What is pinned here: one request reads
 * once, a new request reads again, and every refusal the page makes is still made.
 */

// React's `cache` memoizes only inside a server render, for that request. This stands in for one
// request's scope: a memo per cached function, emptied by `newRequest()`.
const scopes = new Set<Map<unknown, unknown>>();
vi.mock("react", async (actual) => ({
  ...(await actual<typeof import("react")>()),
  cache: <R>(fn: () => R) => {
    const memo = new Map<unknown, unknown>();
    scopes.add(memo);
    return () => {
      if (!memo.has(fn)) memo.set(fn, fn());
      return memo.get(fn) as R;
    };
  },
}));

function newRequest() {
  for (const memo of scopes) memo.clear();
}

let claims: Record<string, unknown> | null;
let profile: { org_id: string | null; role: string | null; display_name?: string | null } | null;
const getClaims = vi.fn(async () => ({ data: claims ? { claims } : null }));
const profileReads = vi.fn();
const createClient = vi.fn(async () => ({
  auth: { getClaims },
  from: (table: string) => ({
    select: (columns: string) => ({
      eq: (column: string, value: string) => ({
        maybeSingle: async () => {
          profileReads(table, columns, column, value);
          return { data: profile, error: null };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => createClient() }));

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

const { authorForRoute, requireAuthor } = await import("@/lib/authoring/session");
const { readViewer, requireStudent } = await import("@/lib/classes/viewer");

const USER = "00000000-0000-4000-8000-0000000000aa";
const ORG = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  newRequest();
  vi.clearAllMocks();
  claims = { sub: USER, email: "person@example.test" };
  profile = { org_id: ORG, role: "instructor", display_name: "Sam Lee" };
});

describe("one verified read per request (perf-audit #20)", () => {
  it("verifies the token and reads the profile once for an /author layout and its page", async () => {
    const [viewer, author] = await Promise.all([readViewer(), requireAuthor("/author")]);
    expect(viewer).toMatchObject({
      status: "signed_in",
      role: "instructor",
      displayName: "Sam Lee",
    });
    expect(author).toMatchObject({ userId: USER, orgId: ORG, email: "person@example.test" });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(profileReads).toHaveBeenCalledTimes(1);
    expect(profileReads).toHaveBeenCalledWith("profiles", expect.any(String), "id", USER);
  });

  it("verifies once for a /learn layout and its page", async () => {
    profile = { org_id: ORG, role: "student", display_name: null };
    await Promise.all([readViewer(), requireStudent()]);
    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(profileReads).toHaveBeenCalledTimes(1);
  });

  it("reads again on the next request, so nothing outlives the request it was read for", async () => {
    await requireAuthor("/author");
    newRequest();
    profile = { org_id: ORG, role: "student" };
    await expect(requireAuthor("/author")).rejects.toThrow("redirect:/learn");
    expect(getClaims).toHaveBeenCalledTimes(2);
    expect(profileReads).toHaveBeenCalledTimes(2);
  });
});

describe("the page still refuses, after the layout read the same request (perf-audit #20)", () => {
  it("sends a signed-out request to sign in", async () => {
    claims = null;
    expect(await readViewer()).toEqual({ status: "signed_out" });
    await expect(requireAuthor("/author/banks")).rejects.toThrow(
      "redirect:/sign-in?next=%2Fauthor%2Fbanks",
    );
    expect(await authorForRoute()).toEqual({ status: "signed_out" });
    expect(profileReads).not.toHaveBeenCalled();
  });

  it("sends a student away from /author, and a teacher away from /learn", async () => {
    profile = { org_id: ORG, role: "student" };
    expect(await readViewer()).toMatchObject({ status: "signed_in", role: "student" });
    await expect(requireAuthor("/author")).rejects.toThrow("redirect:/learn");

    newRequest();
    profile = { org_id: ORG, role: "instructor" };
    expect(await readViewer()).toMatchObject({ role: "instructor" });
    await expect(requireStudent()).rejects.toThrow("redirect:/author");
  });

  it("refuses an account with a role but no org, and one with no role", async () => {
    profile = { org_id: null, role: "instructor" };
    await readViewer();
    expect(await authorForRoute()).toEqual({ status: "forbidden", role: null });

    newRequest();
    profile = { org_id: null, role: null };
    await readViewer();
    await expect(requireAuthor("/author")).rejects.toThrow("redirect:/welcome");
    await expect(requireStudent()).rejects.toThrow("redirect:/welcome");
  });
});
