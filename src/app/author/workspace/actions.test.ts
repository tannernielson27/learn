import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INVITE_GONE,
  INVITE_NOT_MADE,
  INVITE_REFUSAL_MESSAGES,
  notSentMessage,
  RESEND_RECIPIENT_LIMIT,
} from "@/lib/workspace/invite";
import { INVITE_ADDRESS_ERROR } from "@/lib/workspace/inviteAddress";
import { REMOVE_FAILED, REMOVE_REFUSED } from "@/lib/workspace/membership";

/**
 * The workspace page's Server Functions, from the request to the sentence the teacher reads.
 * Only the edges are faked: the two Supabase clients, the mailer, the email limiter and Next. The
 * author check (`requireAuthor`), the invite steps and the email's link are the real ones, so
 * what is pinned is what a request can and cannot do:
 *
 *  - a student or a visitor never reaches the database's invite functions;
 *  - `create_org_invite` is called on the service-role client, for the id the auth server gave;
 *  - the raw token leaves only inside the email's link.
 */

const revalidated = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidated(path) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "learn.example", "x-forwarded-proto": "https" }),
}));

const USER = "00000000-0000-4000-8000-0000000000a1";
const ORG = "00000000-0000-4000-8000-000000000001";
const INVITE = "00000000-0000-4000-8000-0000000000e1";
const OLD_INVITE = "00000000-0000-4000-8000-0000000000e0";
const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const INVITER_EMAIL = "ada@school.edu";
const ADDRESS = "kim@school.edu";
const WORKSPACE = "Ada's workspace";

type Reply = { data?: unknown; count?: number | null; error?: { code?: string } | null };
type Rpc = (name: string, args?: Record<string, unknown>) => Promise<Reply>;

let claims: Record<string, unknown> | null;
let authUser: { id: string; email?: string } | null;
let tables: Record<string, Reply>;
let revokeAnswer: Reply;
let createAnswer: Reply;

/** A query builder whose every step returns itself and which resolves to its table's reply. */
function builderFor(table: string) {
  const builder: Record<string, unknown> = {};
  for (const step of ["select", "eq", "is", "gt", "order", "limit"]) builder[step] = () => builder;
  builder.maybeSingle = async () => tables[table] ?? { data: null, error: null };
  builder.then = (resolve: (value: Reply) => unknown) =>
    resolve(tables[table] ?? { data: null, error: null });
  return builder;
}

/** The signed-in person's client: their own session, under row level security. */
const userClient = {
  auth: {
    getClaims: vi.fn(async () => ({ data: claims ? { claims } : null })),
    getUser: vi.fn(async () =>
      authUser
        ? { data: { user: authUser }, error: null }
        : { data: { user: null }, error: { name: "AuthSessionMissingError" } },
    ),
  },
  from: vi.fn((table: string) => builderFor(table)),
  rpc: vi.fn<Rpc>(async () => revokeAnswer),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => userClient }));

/** The service-role client. It must be asked for `create_org_invite` and nothing else. */
const serviceClient = {
  from: vi.fn(),
  rpc: vi.fn<Rpc>(async () => createAnswer),
};
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => serviceClient }));

const mailerSend = vi.fn<(message: Record<string, unknown>) => Promise<{ id: string }>>(
  async () => ({
    id: "m-1",
  }),
);
vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("@/lib/email")>()),
  getMailer: () => ({ send: mailerSend }),
}));

let allowance: "ok" | "rate_limited" | "ceiling" | "unavailable";
const allow = vi.fn<(inviterId: string) => Promise<typeof allowance>>(async () => allowance);
vi.mock("@/lib/workspace/inviteEmailLimit", () => ({
  takeWorkspaceInviteEmail: (inviterId: string) => allow(inviterId),
}));

const logs = [
  vi.spyOn(console, "error").mockImplementation(() => {}),
  vi.spyOn(console, "warn").mockImplementation(() => {}),
  vi.spyOn(console, "log").mockImplementation(() => {}),
];
function logText(): string {
  return JSON.stringify(logs.map((spy) => spy.mock.calls));
}

const info = vi.spyOn(console, "info").mockImplementation(() => {});

const { inviteColleague, removeMember, resendInvite, revokeInvite } = await import("./actions");

const MEMBER = "00000000-0000-4000-8000-0000000000b2";

function form(email: unknown, extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  if (typeof email === "string") data.set("email", email);
  for (const [name, value] of Object.entries(extra)) data.set(name, value);
  return data;
}

const invite = (data: FormData) => inviteColleague({ status: "idle" }, data);

beforeEach(() => {
  vi.clearAllMocks();
  claims = { sub: USER, email: INVITER_EMAIL };
  authUser = { id: USER, email: INVITER_EMAIL };
  tables = {
    profiles: { data: { org_id: ORG, role: "instructor" }, error: null },
    orgs: { data: { name: WORKSPACE, self_registered: true }, error: null },
    org_invites: {
      data: { email: ADDRESS, accepted_at: null, revoked_at: null },
      count: 0,
      error: null,
    },
  };
  revokeAnswer = { data: "revoked", error: null };
  createAnswer = {
    data: [
      { status: "created", invite_id: INVITE, token: TOKEN, expires_at: "2026-10-16T12:00:00Z" },
    ],
    error: null,
  };
  allowance = "ok";
});

describe("who may use the workspace actions", () => {
  const actions: [string, () => Promise<unknown>][] = [
    ["inviteColleague", () => invite(form(ADDRESS))],
    ["revokeInvite", () => revokeInvite(INVITE)],
    ["resendInvite", () => resendInvite(INVITE)],
    ["removeMember", () => removeMember(MEMBER)],
  ];

  it.each(actions)("%s sends a signed-out visitor to sign in", async (_name, run) => {
    claims = null;
    await expect(run()).rejects.toThrow("redirect:/sign-in?next=%2Fauthor%2Fworkspace");
    expect(serviceClient.rpc).not.toHaveBeenCalled();
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(mailerSend).not.toHaveBeenCalled();
  });

  it.each(actions)("%s sends a student to the student home", async (_name, run) => {
    tables.profiles = { data: { org_id: ORG, role: "student" }, error: null };
    await expect(run()).rejects.toThrow("redirect:/learn");
    expect(serviceClient.rpc).not.toHaveBeenCalled();
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(mailerSend).not.toHaveBeenCalled();
  });

  it.each(actions)("%s sends an account with no role to the welcome page", async (_name, run) => {
    tables.profiles = { data: { org_id: null, role: null }, error: null };
    await expect(run()).rejects.toThrow("redirect:/welcome");
    expect(serviceClient.rpc).not.toHaveBeenCalled();
  });

  it.each(actions)(
    "%s stops when the auth server does not vouch for the session",
    async (_name, run) => {
      // The token's signature checks out, and the auth server no longer knows the session.
      authUser = null;
      await expect(run()).rejects.toThrow("redirect:/sign-in?next=%2Fauthor%2Fworkspace");
      expect(userClient.auth.getUser).toHaveBeenCalled();
      expect(serviceClient.rpc).not.toHaveBeenCalled();
      expect(userClient.rpc).not.toHaveBeenCalled();
    },
  );
});

describe("inviteColleague", () => {
  it("invites as the verified account on the service-role client, and emails the link", async () => {
    expect(await invite(form(`  ${ADDRESS.toUpperCase()} `))).toEqual({
      status: "sent",
      email: ADDRESS,
    });
    expect(serviceClient.rpc).toHaveBeenCalledTimes(1);
    expect(serviceClient.rpc).toHaveBeenCalledWith("create_org_invite", {
      p_inviter: USER,
      p_email: ADDRESS,
    });
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(allow).toHaveBeenCalledWith(USER);
    expect(mailerSend).toHaveBeenCalledTimes(1);
    expect(mailerSend.mock.calls[0]![0]).toMatchObject({
      to: ADDRESS,
      idempotencyKey: `workspace-invite:${INVITE}`,
    });
    expect(revalidated).toHaveBeenCalledWith("/author/workspace");
  });

  it("takes the inviter from the auth server, never from the token's claims or the form", async () => {
    const other = "00000000-0000-4000-8000-0000000000ff";
    // A claim that disagrees, and a form that names somebody else: neither is believed.
    claims = { sub: USER, email: "claimed@evil.test" };
    await invite(
      form(ADDRESS, { p_inviter: other, inviter: other, userId: other, inviterId: other }),
    );
    expect(serviceClient.rpc).toHaveBeenCalledWith("create_org_invite", {
      p_inviter: USER,
      p_email: ADDRESS,
    });
    expect(JSON.stringify(mailerSend.mock.calls)).toContain(INVITER_EMAIL);
    expect(JSON.stringify(mailerSend.mock.calls)).not.toContain("claimed@evil.test");
  });

  it("puts the raw token in the email's link and nowhere else", async () => {
    const result = await invite(form(ADDRESS));
    const message = mailerSend.mock.calls[0]![0];
    expect(String(message.text)).toContain(`https://learn.example/w/${TOKEN}`);
    expect(String(message.html)).toContain(`/w/${TOKEN}`);
    // Not in what the browser gets back, not in a log, not in what keys the send.
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(logText()).not.toContain(TOKEN);
    expect(String(message.idempotencyKey)).not.toContain(TOKEN);
    expect(String(message.subject)).not.toContain(TOKEN);
    expect(JSON.stringify(revalidated.mock.calls)).not.toContain(TOKEN);
  });

  it("keeps the token out of every answer when the email does not go out", async () => {
    const results = [];
    for (const state of ["rate_limited", "ceiling", "unavailable"] as const) {
      allowance = state;
      results.push(await invite(form(ADDRESS)));
    }
    allowance = "ok";
    mailerSend.mockRejectedValueOnce(new Error(`refused ${TOKEN}`));
    results.push(await invite(form(ADDRESS)));
    expect(JSON.stringify(results)).not.toContain(TOKEN);
    expect(logText()).not.toContain(TOKEN);
  });

  it.each([
    ["nothing", ""],
    ["two addresses", "kim@school.edu, lee@school.edu"],
    ["angle brackets", "Kim <kim@school.edu>"],
    ["a quote", '"kim"@school.edu'],
    ["a semicolon", "kim@school.edu;"],
    ["parentheses", "kim(x)@school.edu"],
    ["a backslash", "kim\\@school.edu"],
    ["a line feed", "kim@school.edu\nBcc: eve@evil.test"],
    ["over 254 characters", `${"a".repeat(250)}@school.edu`],
  ])("refuses %s before the database is asked", async (_what, value) => {
    expect(await invite(form(value))).toEqual({ status: "error", error: INVITE_ADDRESS_ERROR });
    expect(serviceClient.rpc).not.toHaveBeenCalled();
    expect(mailerSend).not.toHaveBeenCalled();
  });

  it("refuses a form with no email field, or a file in its place", async () => {
    expect(await invite(form(undefined))).toMatchObject({ status: "error" });
    const withFile = new FormData();
    withFile.set("email", new File(["kim@school.edu"], "email.txt"));
    expect(await invite(withFile)).toMatchObject({ status: "error" });
    expect(serviceClient.rpc).not.toHaveBeenCalled();
  });

  it.each([
    "invalid_email",
    "shared_workspace",
    "unconfirmed",
    "already_member",
    "already_invited",
    "members_full",
    "invites_full",
    "rate_limited",
    "recipient_limited",
  ] as const)("says why in plain words when the database answers %s", async (status) => {
    createAnswer = {
      data: [{ status, invite_id: null, token: null, expires_at: null }],
      error: null,
    };
    expect(await invite(form(ADDRESS))).toEqual({
      status: "error",
      error: INVITE_REFUSAL_MESSAGES[status],
    });
    expect(mailerSend).not.toHaveBeenCalled();
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  it("does not ask the database to invite into a workspace that is not self-registered", async () => {
    tables.orgs = { data: { name: "LeaRN", self_registered: false }, error: null };
    expect(await invite(form(ADDRESS))).toEqual({
      status: "error",
      error: INVITE_REFUSAL_MESSAGES.shared_workspace,
    });
    expect(serviceClient.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["rate_limited", "rate_limited"],
    ["ceiling", "ceiling"],
    ["unavailable", "failed"],
  ] as const)(
    "revokes the invitation it made when the email limiter answers %s",
    async (state, result) => {
      allowance = state;
      expect(await invite(form(ADDRESS))).toEqual({
        status: "error",
        error: notSentMessage(result, true),
      });
      expect(mailerSend).not.toHaveBeenCalled();
      expect(userClient.rpc).toHaveBeenCalledWith("revoke_org_invite", { p_invite: INVITE });
    },
  );

  it("revokes the invitation it made when the mailer refuses, and says it was not sent", async () => {
    mailerSend.mockRejectedValueOnce(new Error("Resend said no"));
    const result = await invite(form(ADDRESS));
    expect(result).toEqual({ status: "error", error: notSentMessage("failed", true) });
    expect(userClient.rpc).toHaveBeenCalledWith("revoke_org_invite", { p_invite: INVITE });
  });

  it("says the invitation is still listed when it could not be revoked either", async () => {
    mailerSend.mockRejectedValueOnce(new Error("Resend said no"));
    revokeAnswer = { data: null, error: { code: "57014" } };
    expect(await invite(form(ADDRESS))).toEqual({
      status: "error",
      error: notSentMessage("failed", false),
    });
  });

  it("answers a database error with a plain sentence, and logs only its code", async () => {
    createAnswer = {
      data: null,
      error: { code: "42501", message: `not for ${ADDRESS}` } as Reply["error"],
    };
    expect(await invite(form(ADDRESS))).toEqual({ status: "error", error: INVITE_NOT_MADE });
    expect(logText()).toContain("42501");
    expect(logText()).not.toContain(ADDRESS);
    expect(mailerSend).not.toHaveBeenCalled();
  });

  it("makes nothing when the workspace cannot be read", async () => {
    tables.orgs = { data: null, error: { code: "57014" } };
    expect(await invite(form(ADDRESS))).toEqual({ status: "error", error: INVITE_NOT_MADE });
    expect(serviceClient.rpc).not.toHaveBeenCalled();
  });

  it("never uses the service-role client for a table read", async () => {
    await invite(form(ADDRESS));
    await resendInvite(OLD_INVITE);
    await revokeInvite(INVITE);
    expect(serviceClient.from).not.toHaveBeenCalled();
    for (const [name] of serviceClient.rpc.mock.calls) expect(name).toBe("create_org_invite");
  });
});

describe("revokeInvite", () => {
  it("revokes through the teacher's own client and refreshes the page", async () => {
    expect(await revokeInvite(INVITE)).toEqual({ ok: true });
    expect(userClient.rpc).toHaveBeenCalledWith("revoke_org_invite", { p_invite: INVITE });
    expect(serviceClient.rpc).not.toHaveBeenCalled();
    expect(revalidated).toHaveBeenCalledWith("/author/workspace");
  });

  it("leaves an id from another workspace to the function's not_found, and says no more", async () => {
    revokeAnswer = { data: "not_found", error: null };
    const outcome = await revokeInvite("00000000-0000-4000-8000-00000000beef");
    expect(outcome).toEqual({ ok: false, message: INVITE_GONE });
    expect(JSON.stringify(outcome)).not.toMatch(/another|not yours|permission/i);
  });

  it("says so when the colleague has already accepted", async () => {
    revokeAnswer = { data: "already_accepted", error: null };
    expect(await revokeInvite(INVITE)).toMatchObject({ ok: false });
  });

  it("refuses an id that is not one before asking the database", async () => {
    expect(await revokeInvite("1; drop table org_invites")).toEqual({
      ok: false,
      message: INVITE_GONE,
    });
    expect(userClient.rpc).not.toHaveBeenCalled();
  });
});

describe("resendInvite", () => {
  it("revokes the earlier invitation and emails a new one to the address on the row", async () => {
    expect(await resendInvite(OLD_INVITE)).toEqual({ ok: true });
    expect(userClient.rpc).toHaveBeenCalledWith("revoke_org_invite", { p_invite: OLD_INVITE });
    expect(serviceClient.rpc).toHaveBeenCalledWith("create_org_invite", {
      p_inviter: USER,
      p_email: ADDRESS,
    });
    expect(mailerSend.mock.calls[0]![0]).toMatchObject({ to: ADDRESS });
    expect(revalidated).toHaveBeenCalledWith("/author/workspace");
  });

  it("returns no token and logs none", async () => {
    const outcome = await resendInvite(OLD_INVITE);
    expect(JSON.stringify(outcome)).not.toContain(TOKEN);
    expect(logText()).not.toContain(TOKEN);
  });

  it("changes nothing for an invitation the teacher cannot see", async () => {
    tables.org_invites = { data: null, count: 0, error: null };
    expect(await resendInvite(OLD_INVITE)).toEqual({ ok: false, message: INVITE_GONE });
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(serviceClient.rpc).not.toHaveBeenCalled();
  });

  it("keeps the earlier invitation when the teacher is at five for the day", async () => {
    tables.org_invites = { ...tables.org_invites, count: 5 };
    expect(await resendInvite(OLD_INVITE)).toMatchObject({ ok: false });
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(serviceClient.rpc).not.toHaveBeenCalled();
  });

  it("keeps the earlier invitation when the address has had three in the day", async () => {
    tables.org_invites = { ...tables.org_invites, count: 3 };
    expect(await resendInvite(OLD_INVITE)).toEqual({ ok: false, message: RESEND_RECIPIENT_LIMIT });
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(serviceClient.rpc).not.toHaveBeenCalled();
    expect(serviceClient.from).not.toHaveBeenCalled();
  });

  it("refuses an id that is not one before reading anything", async () => {
    expect(await resendInvite("nope")).toEqual({ ok: false, message: INVITE_GONE });
    expect(userClient.from).not.toHaveBeenCalledWith("org_invites");
  });
});

describe("removeMember", () => {
  it("removes through the teacher's own client, naming only the member, and refreshes the page", async () => {
    revokeAnswer = { data: "removed", error: null };
    expect(await removeMember(MEMBER)).toEqual({ ok: true });
    expect(userClient.rpc).toHaveBeenCalledTimes(1);
    expect(userClient.rpc).toHaveBeenCalledWith("remove_org_member", { p_member: MEMBER });
    // Who is asking is the session's: the service role, which could name anyone, is never used.
    expect(serviceClient.rpc).not.toHaveBeenCalled();
    expect(serviceClient.from).not.toHaveBeenCalled();
    expect(revalidated).toHaveBeenCalledWith("/author/workspace");
  });

  it.each(["shared_workspace", "not_founder", "is_founder", "not_found", "is_admin"] as const)(
    "says why when the database answers %s, and logs no removal",
    async (answer) => {
      revokeAnswer = { data: answer, error: null };
      expect(await removeMember(MEMBER)).toEqual({ ok: false, message: REMOVE_REFUSED[answer] });
      expect(info).not.toHaveBeenCalled();
    },
  );

  it("logs a removal once, with the three ids and no name or address", async () => {
    revokeAnswer = { data: "removed", error: null };
    await removeMember(MEMBER);
    expect(info.mock.calls).toEqual([
      ["[workspace] member_removed", { actor: USER, target: MEMBER, org: ORG }],
    ]);
    expect(JSON.stringify(info.mock.calls)).not.toContain(INVITER_EMAIL);
  });

  it("answers a database error, or a database without the function, with a plain sentence", async () => {
    revokeAnswer = { data: null, error: { code: "PGRST202" } };
    expect(await removeMember(MEMBER)).toEqual({ ok: false, message: REMOVE_FAILED });
    expect(logText()).toContain("PGRST202");
    expect(logText()).not.toContain(MEMBER);
  });

  it("refuses an id that is not one before asking the database", async () => {
    expect(await removeMember("nope")).toEqual({
      ok: false,
      message: REMOVE_REFUSED.not_found,
    });
    expect(userClient.rpc).not.toHaveBeenCalled();
  });
});
