import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptOrgInvite, previewOrgMove, resolveOrgInvite } from "./orgInvites";

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const USER = "00000000-0000-4000-8000-0000000000a1";
const ROW = {
  state: "pending",
  workspace_name: "Ada’s workspace",
  inviter_name: "Ada Lovelace",
  inviter_email: "ada@school.edu",
  invited_email: "grace@school.edu",
  expires_at: "2026-10-16T12:00:00Z",
};

type Reply = { data: unknown; error: { code?: string; message?: string } | null };
let reply: Reply;
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<Reply>>(
  async () => reply,
);
const service = { rpc } as unknown as Parameters<typeof resolveOrgInvite>[0];

const logged = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  reply = { data: [ROW], error: null };
});

describe("resolveOrgInvite", () => {
  it("asks with the token and the caller's address, and reads the row", async () => {
    expect(await resolveOrgInvite(service, TOKEN, "203.0.113.7")).toEqual({
      status: "found",
      state: "pending",
      workspaceName: "Ada’s workspace",
      inviterName: "Ada Lovelace",
      inviterEmail: "ada@school.edu",
      invitedEmail: "grace@school.edu",
      expiresAt: "2026-10-16T12:00:00Z",
    });
    expect(rpc).toHaveBeenCalledWith("resolve_org_invite", {
      token: TOKEN,
      client_key: "203.0.113.7",
    });
  });

  it("passes no key when there is no caller to count, and clips an overlong token", async () => {
    await resolveOrgInvite(service, "x".repeat(500), null);
    expect(rpc).toHaveBeenCalledWith("resolve_org_invite", {
      token: "x".repeat(64),
      client_key: undefined,
    });
  });

  it.each(["pending", "expired", "revoked", "accepted"])("reads the state %s", async (state) => {
    reply = { data: [{ ...ROW, state }], error: null };
    expect(await resolveOrgInvite(service, TOKEN, null)).toMatchObject({ status: "found", state });
  });

  it("reads an inviter who is gone or unnamed", async () => {
    reply = { data: [{ ...ROW, inviter_name: null, inviter_email: null }], error: null };
    expect(await resolveOrgInvite(service, TOKEN, null)).toMatchObject({
      inviterName: null,
      inviterEmail: null,
    });
  });

  it("answers an unknown token and a refused caller identically", async () => {
    reply = { data: [], error: null };
    const unknown = await resolveOrgInvite(service, TOKEN, "203.0.113.7");
    reply = { data: null, error: { code: "PT429", message: "too many" } };
    const limited = await resolveOrgInvite(service, TOKEN, "203.0.113.7");
    expect(unknown).toEqual({ status: "invalid" });
    expect(limited).toEqual(unknown);
  });

  it("is unavailable when the database cannot answer, or answers a state nobody knows", async () => {
    reply = { data: null, error: { code: "08006", message: `no route for ${TOKEN}` } };
    expect(await resolveOrgInvite(service, TOKEN, null)).toEqual({ status: "unavailable" });
    reply = { data: [{ ...ROW, state: "paused" }], error: null };
    expect(await resolveOrgInvite(service, TOKEN, null)).toEqual({ status: "unavailable" });
  });

  it("never logs the token, an address or the database's message", async () => {
    reply = { data: null, error: { code: "08006", message: `no route for ${TOKEN}` } };
    await resolveOrgInvite(service, TOKEN, "203.0.113.7");
    const said = JSON.stringify(logged.mock.calls);
    expect(said).not.toContain(TOKEN);
    expect(said).not.toContain("203.0.113.7");
    expect(said).not.toContain("no route");
  });
});

describe("acceptOrgInvite", () => {
  it("accepts for the account the server names", async () => {
    reply = { data: "accepted", error: null };
    expect(await acceptOrgInvite(service, USER, TOKEN)).toBe("accepted");
    expect(rpc).toHaveBeenCalledWith("accept_org_invite", { p_user: USER, token: TOKEN });
  });

  it.each([
    "invalid",
    "already_accepted",
    "revoked",
    "expired",
    "wrong_address",
    "student",
    "already_teaches",
    "already_member",
    "teaches_shared",
    "founder_with_members",
    "students_depend",
    "move_needs_confirmation",
    "shared_workspace",
    "members_full",
  ])("hands %s back as the database said it", async (answer) => {
    reply = { data: answer, error: null };
    expect(await acceptOrgInvite(service, USER, TOKEN)).toBe(answer);
  });

  it("names two arguments unless a move is confirmed, so either function answers", async () => {
    reply = { data: "move_needs_confirmation", error: null };
    await acceptOrgInvite(service, USER, TOKEN);
    await acceptOrgInvite(service, USER, TOKEN, false);
    expect(rpc.mock.calls).toEqual([
      ["accept_org_invite", { p_user: USER, token: TOKEN }],
      ["accept_org_invite", { p_user: USER, token: TOKEN }],
    ]);
  });

  it("sends the confirmation when the person gave it", async () => {
    reply = { data: "accepted", error: null };
    expect(await acceptOrgInvite(service, USER, TOKEN, true)).toBe("accepted");
    expect(rpc.mock.calls).toEqual([
      ["accept_org_invite", { p_user: USER, token: TOKEN, p_confirm_move: true }],
    ]);
  });

  it("asks the older function when the database has no three-argument one", async () => {
    rpc.mockImplementationOnce(async () => ({ data: null, error: { code: "PGRST202" } }));
    reply = { data: "already_teaches", error: null };
    expect(await acceptOrgInvite(service, USER, TOKEN, true)).toBe("already_teaches");
    expect(rpc.mock.calls).toEqual([
      ["accept_org_invite", { p_user: USER, token: TOKEN, p_confirm_move: true }],
      ["accept_org_invite", { p_user: USER, token: TOKEN }],
    ]);
  });

  it("does not ask twice for any other error, or for an unconfirmed call", async () => {
    reply = { data: null, error: { code: "08006" } };
    expect(await acceptOrgInvite(service, USER, TOKEN, true)).toBe("unavailable");
    reply = { data: null, error: { code: "PGRST202" } };
    expect(await acceptOrgInvite(service, USER, TOKEN)).toBe("unavailable");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("is unavailable on an error or an answer nobody knows, and logs neither id nor token", async () => {
    reply = { data: null, error: { code: "P0002", message: `no account ${USER}` } };
    expect(await acceptOrgInvite(service, USER, TOKEN)).toBe("unavailable");
    reply = { data: "promoted", error: null };
    expect(await acceptOrgInvite(service, USER, TOKEN)).toBe("unavailable");
    const said = JSON.stringify(logged.mock.calls);
    expect(said).not.toContain(TOKEN);
    expect(said).not.toContain(USER);
  });
});

describe("previewOrgMove", () => {
  const MOVE = {
    status: "move_needs_confirmation",
    leaving_workspace: "Grace’s workspace",
    bank_count: 3,
    class_count: 1,
  };
  const only = (status: string) => ({
    status,
    leaving_workspace: null,
    bank_count: null,
    class_count: null,
  });

  it("asks for the account the server names, and reads what a move would cost", async () => {
    reply = { data: [MOVE], error: null };
    expect(await previewOrgMove(service, USER, TOKEN)).toEqual({
      status: "move",
      leavingWorkspace: "Grace’s workspace",
      bankCount: 3,
      classCount: 1,
    });
    expect(rpc).toHaveBeenCalledWith("org_invite_move_preview", { p_user: USER, token: TOKEN });
  });

  it("clips an overlong token", async () => {
    reply = { data: [only("invalid")], error: null };
    await previewOrgMove(service, USER, "x".repeat(500));
    expect(rpc).toHaveBeenCalledWith("org_invite_move_preview", {
      p_user: USER,
      token: "x".repeat(64),
    });
  });

  it.each([
    "wrong_address",
    "already_member",
    "teaches_shared",
    "founder_with_members",
    "students_depend",
  ] as const)("reads the refusal %s", async (reason) => {
    reply = { data: [only(reason)], error: null };
    expect(await previewOrgMove(service, USER, TOKEN)).toEqual({ status: "refused", reason });
  });

  it("says so when the account does not teach", async () => {
    reply = { data: [only("not_teaching")], error: null };
    expect(await previewOrgMove(service, USER, TOKEN)).toEqual({ status: "not_teaching" });
  });

  it("is unknown, and quiet, on a database that does not have the function", async () => {
    reply = { data: null, error: { code: "PGRST202", message: "no function" } };
    expect(await previewOrgMove(service, USER, TOKEN)).toEqual({ status: "unknown" });
    expect(logged).not.toHaveBeenCalled();
  });

  it("is unknown for a token the database does not know, without logging", async () => {
    reply = { data: [only("invalid")], error: null };
    expect(await previewOrgMove(service, USER, TOKEN)).toEqual({ status: "unknown" });
    expect(logged).not.toHaveBeenCalled();
  });

  it.each([
    ["an error", { data: null, error: { code: "08006", message: `no route for ${TOKEN}` } }],
    ["no row", { data: [], error: null }],
    ["an answer nobody knows", { data: [only("promoted")], error: null }],
    ["a move with no name", { data: [{ ...MOVE, leaving_workspace: null }], error: null }],
    ["a move with no count", { data: [{ ...MOVE, bank_count: null }], error: null }],
    ["a count that is not one", { data: [{ ...MOVE, class_count: -1 }], error: null }],
  ])("is unknown on %s, and logs neither id nor token", async (_what, answer) => {
    reply = answer;
    expect(await previewOrgMove(service, USER, TOKEN)).toEqual({ status: "unknown" });
    const said = JSON.stringify(logged.mock.calls);
    expect(logged).toHaveBeenCalled();
    expect(said).not.toContain(TOKEN);
    expect(said).not.toContain(USER);
  });
});
