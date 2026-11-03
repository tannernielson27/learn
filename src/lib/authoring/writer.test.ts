import { beforeEach, describe, expect, it, vi } from "vitest";

/** The write gate (#521): `requireAuthor`, then a redirect to the read-only page when lapsed. */

const session = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
const requireAuthor = vi.fn(async (returnTo: string) => ({ ...session.value, returnTo }));
vi.mock("./session", () => ({ requireAuthor: (to: string) => requireAuthor(to) }));

const rpc = vi.fn(async () => ({
  data: [{ has_access: false, source: "none", is_founder: false }],
  error: null,
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const { READ_ONLY_PATH, readOnlyPath, requireWriter } = await import("./writer");

const base = { supabase: { rpc }, userId: "u", email: "e@x.test", orgId: "o" };

beforeEach(() => {
  rpc.mockClear();
  requireAuthor.mockClear();
  vi.unstubAllEnvs();
});

describe("requireWriter", () => {
  it("hands back the session when the workspace may write", async () => {
    session.value = { ...base, readOnly: null };
    expect(await requireWriter("/author")).toEqual(base);
    expect(requireAuthor).toHaveBeenCalledWith("/author");
  });

  it("sends a read-only teacher to the read-only page, which links back", async () => {
    session.value = { ...base, readOnly: { readOnly: true, canManage: true } };
    await expect(requireWriter("/author/banks/b?folder=f")).rejects.toThrow(
      `redirect:${READ_ONLY_PATH}?next=%2Fauthor%2Fbanks%2Fb%3Ffolder%3Df`,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads nothing for a session without the state while BILLING_ENFORCED is unset", async () => {
    session.value = { ...base };
    expect(await requireWriter("/author")).toEqual(base);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads the state itself for a session without it while enforced", async () => {
    vi.stubEnv("BILLING_ENFORCED", "true");
    session.value = { ...base };
    await expect(requireWriter("/author")).rejects.toThrow(`redirect:${readOnlyPath("/author")}`);
    expect(rpc).toHaveBeenCalledWith("workspace_access");
  });
});
