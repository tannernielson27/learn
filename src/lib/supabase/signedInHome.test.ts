import { describe, expect, it, vi } from "vitest";
import { signedInTarget } from "./signedInHome";

type Client = Parameters<typeof signedInTarget>[0];

function client(options: {
  sub?: unknown;
  profile?: { role: string | null } | null;
  error?: { code: string } | null;
  throws?: boolean;
}) {
  const maybeSingle = vi.fn(async () => ({
    data: options.profile ?? null,
    error: options.error ?? null,
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const getClaims = vi.fn(async () => {
    if (options.throws) throw new Error("network");
    return { data: { claims: { sub: "sub" in options ? options.sub : "user-1" } } };
  });
  return { supabase: { auth: { getClaims }, from } as unknown as Client, from, eq, getClaims };
}

describe("signedInTarget (#363)", () => {
  it.each([
    ["instructor", "/author"],
    ["admin", "/author"],
    ["student", "/learn"],
    [null, "/welcome"],
  ])("sends a %s with nowhere asked for to %s", async (role, home) => {
    const fake = client({ profile: { role } });
    expect(await signedInTarget(fake.supabase, "/author")).toBe(home);
    expect(fake.from).toHaveBeenCalledWith("profiles");
    expect(fake.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("sends an account with no profile row to the welcome page", async () => {
    expect(await signedInTarget(client({ profile: null }).supabase, "/author")).toBe("/welcome");
  });

  it("follows a next that was asked for without reading anything", async () => {
    const fake = client({ profile: { role: "student" } });
    expect(await signedInTarget(fake.supabase, "/author/banks/1")).toBe("/author/banks/1");
    expect(await signedInTarget(fake.supabase, "/account/password?next=%2Flearn")).toBe(
      "/account/password?next=%2Flearn",
    );
    expect(fake.getClaims).not.toHaveBeenCalled();
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("never throws: the default stands when the role cannot be read", async () => {
    expect(await signedInTarget(client({ throws: true }).supabase, "/author")).toBe("/author");
    expect(await signedInTarget(client({ sub: undefined }).supabase, "/author")).toBe("/author");
    const refused = client({ error: { code: "08006" } });
    expect(await signedInTarget(refused.supabase, "/author")).toBe("/author");
  });
});
