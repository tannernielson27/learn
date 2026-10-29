import { describe, expect, it, vi } from "vitest";
import { formatPasses, issuePass, listPasses, revokePasses } from "./commands.mjs";
import { tokenHash } from "./token.mjs";

type Reply = { data: unknown; error: { code?: string; message?: string } | null };
function client(reply: Reply) {
  return {
    rpc: vi.fn<(name: string, args?: Record<string, unknown>) => Promise<Reply>>(async () => reply),
  };
}

const ORIGIN = "https://learnursing.app";

describe("issuePass", () => {
  it("sends only the digest, and returns the one link that holds the token", async () => {
    const c = client({
      data: [{ status: "issued", expires_at: "2026-11-27T00:00:00Z" }],
      error: null,
    });
    const issued = await issuePass(c, { email: "fay@school.edu", note: "spring", origin: ORIGIN });
    expect(issued.status).toBe("issued");
    const token = issued.link!.slice(`${ORIGIN}/b/`.length);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const [name, args] = c.rpc.mock.calls[0]!;
    expect(name).toBe("issue_beta_pass");
    expect(args).toEqual({
      p_email: "fay@school.edu",
      p_token_hash: tokenHash(token),
      p_note: "spring",
      p_created_by: "scripts/beta-pass.mjs",
    });
    expect(JSON.stringify(args)).not.toContain(token);
  });

  it("returns no link for a refusal", async () => {
    const c = client({ data: [{ status: "already_issued", expires_at: null }], error: null });
    expect(await issuePass(c, { email: "fay@school.edu", note: "x", origin: ORIGIN })).toEqual({
      status: "already_issued",
      link: null,
    });
  });

  it("throws on a database error, naming the code", async () => {
    const c = client({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(
      issuePass(c, { email: "fay@school.edu", note: "x", origin: ORIGIN }),
    ).rejects.toThrow("42501");
  });
});

describe("listPasses and revokePasses", () => {
  it("list returns the rows", async () => {
    const c = client({ data: [{ email: "fay@school.edu" }], error: null });
    expect(await listPasses(c)).toEqual([{ email: "fay@school.edu" }]);
    expect(c.rpc).toHaveBeenCalledWith("list_beta_passes");
  });

  it("revoke sends the address and reads the counts", async () => {
    const c = client({ data: [{ passes_revoked: 1, grants_revoked: 1 }], error: null });
    expect(await revokePasses(c, "fay@school.edu")).toEqual({ passes: 1, grants: 1 });
    expect(c.rpc).toHaveBeenCalledWith("revoke_beta_pass", { p_email: "fay@school.edu" });
  });
});

describe("formatPasses", () => {
  it("prints one line per pass, with its state, workspace, access and note", () => {
    expect(
      formatPasses([
        {
          state: "redeemed",
          email: "fay@school.edu",
          created_at: "2026-10-28T10:00:00Z",
          redeemed_at: "2026-10-29T10:00:00Z",
          workspace_name: "Fay’s workspace",
          grant_active: true,
          note: "spring",
        },
        {
          state: "pending",
          email: "tom@school.edu",
          created_at: "2026-10-28T10:00:00Z",
          redeemed_at: null,
          workspace_name: null,
          grant_active: false,
          note: null,
        },
      ]),
    ).toBe(
      [
        'redeemed fay@school.edu 2026-10-29 "Fay’s workspace" access on (spring)',
        "pending  tom@school.edu 2026-10-28",
      ].join("\n"),
    );
    expect(formatPasses([])).toBe("No passes yet.");
  });
});
