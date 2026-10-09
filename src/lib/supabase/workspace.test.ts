import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countInvitesSince,
  createOrgInvite,
  findInvite,
  INVITE_REFUSALS,
  listMembers,
  listOpenInvites,
  readWorkspace,
  revokeOrgInvite,
} from "./workspace";

type Reply = {
  data?: unknown;
  count?: number | null;
  error?: { code?: string; message?: string } | null;
};
type Client = Parameters<typeof listMembers>[0];

const ORG = "00000000-0000-4000-8000-000000000001";
const INVITER = "00000000-0000-4000-8000-0000000000a1";
const INVITE = "00000000-0000-4000-8000-0000000000e1";
const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const ADDRESS = "kim@school.edu";
/** What Postgres might say, quoting the row. It must stay out of the log. */
const LEAKY = { code: "42501", message: `permission denied for ${ADDRESS} ${TOKEN}` };

/** A query builder whose every step returns itself and which resolves to `reply` when awaited. */
function fakeQuery(reply: Reply) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const step of ["select", "eq", "is", "gt", "order", "limit"]) {
    builder[step] = (...args: unknown[]) => {
      calls.push([step, args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => reply;
  builder.then = (resolve: (value: Reply) => unknown) => resolve(reply);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as Client, from, calls };
}

function fakeRpc(reply: Reply) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as Client, rpc };
}

const logged = vi.spyOn(console, "error").mockImplementation(() => {});
function logText(): string {
  return JSON.stringify(logged.mock.calls);
}

beforeEach(() => logged.mockClear());

describe("readWorkspace", () => {
  it("reads the name and whether the workspace is self-registered", async () => {
    const fake = fakeQuery({ data: { name: "Kim's workspace", self_registered: true } });
    expect(await readWorkspace(fake.client, ORG)).toEqual({
      name: "Kim's workspace",
      selfRegistered: true,
    });
    expect(fake.from).toHaveBeenCalledWith("orgs");
    expect(fake.calls).toContainEqual(["eq", ["id", ORG]]);
  });

  it("is null when the read fails or finds nothing", async () => {
    expect(await readWorkspace(fakeQuery({ data: null, error: LEAKY }).client, ORG)).toBeNull();
    expect(await readWorkspace(fakeQuery({ data: null }).client, ORG)).toBeNull();
  });
});

describe("listMembers", () => {
  it("lists the members org_members() returns", async () => {
    const fake = fakeRpc({
      data: [
        {
          profile_id: INVITER,
          display_name: "Kim Lee",
          email: ADDRESS,
          role: "instructor",
          joined_at: "2026-10-01T10:00:00Z",
        },
      ],
    });
    expect(await listMembers(fake.client)).toEqual([
      {
        profileId: INVITER,
        displayName: "Kim Lee",
        email: ADDRESS,
        role: "instructor",
        joinedAt: "2026-10-01T10:00:00Z",
      },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith("org_members");
  });

  it("is null on a failure", async () => {
    expect(await listMembers(fakeRpc({ data: null, error: LEAKY }).client)).toBeNull();
  });
});

describe("listOpenInvites", () => {
  it("names its columns, and never asks for the token's hash or for everything", async () => {
    const fake = fakeQuery({
      data: [
        {
          id: INVITE,
          email: ADDRESS,
          created_at: "2026-10-08T10:00:00Z",
          expires_at: "2026-10-15T10:00:00Z",
        },
      ],
    });
    expect(await listOpenInvites(fake.client)).toEqual([
      {
        id: INVITE,
        email: ADDRESS,
        createdAt: "2026-10-08T10:00:00Z",
        expiresAt: "2026-10-15T10:00:00Z",
      },
    ]);
    expect(fake.from).toHaveBeenCalledWith("org_invites");
    const selected = fake.calls.filter(([step]) => step === "select").map(([, args]) => args[0]);
    expect(selected).toEqual(["id, email, created_at, expires_at"]);
    expect(String(selected[0])).not.toContain("*");
    expect(String(selected[0])).not.toContain("token");
  });

  it("asks only for invitations nobody accepted or revoked, and for a bounded number", async () => {
    const fake = fakeQuery({ data: [] });
    await listOpenInvites(fake.client);
    expect(fake.calls).toContainEqual(["is", ["accepted_at", null]]);
    expect(fake.calls).toContainEqual(["is", ["revoked_at", null]]);
    expect(fake.calls).toContainEqual(["limit", [50]]);
  });

  it("is null on a failure", async () => {
    expect(await listOpenInvites(fakeQuery({ data: null, error: LEAKY }).client)).toBeNull();
  });
});

describe("findInvite", () => {
  it("gives the address of an open invitation, read by named columns", async () => {
    const fake = fakeQuery({ data: { email: ADDRESS, accepted_at: null, revoked_at: null } });
    expect(await findInvite(fake.client, INVITE)).toEqual({ email: ADDRESS });
    expect(fake.calls).toContainEqual(["select", ["email, accepted_at, revoked_at"]]);
    expect(fake.calls).toContainEqual(["eq", ["id", INVITE]]);
  });

  it("tells an accepted one, a revoked one, a missing one and a failed read apart", async () => {
    const at = "2026-10-08T10:00:00Z";
    const row = { email: ADDRESS, accepted_at: null, revoked_at: null };
    expect(await findInvite(fakeQuery({ data: { ...row, accepted_at: at } }).client, INVITE)).toBe(
      "accepted",
    );
    expect(await findInvite(fakeQuery({ data: { ...row, revoked_at: at } }).client, INVITE)).toBe(
      "gone",
    );
    expect(await findInvite(fakeQuery({ data: null }).client, INVITE)).toBe("gone");
    expect(await findInvite(fakeQuery({ data: null, error: LEAKY }).client, INVITE)).toBe("failed");
  });
});

describe("countInvitesSince", () => {
  it("counts the inviter's own invitations since a moment, without reading a row", async () => {
    const fake = fakeQuery({ count: 4, error: null });
    const since = new Date("2026-10-08T12:00:00Z");
    expect(await countInvitesSince(fake.client, INVITER, since)).toBe(4);
    expect(fake.calls).toContainEqual(["select", ["id", { count: "exact", head: true }]]);
    expect(fake.calls).toContainEqual(["eq", ["invited_by", INVITER]]);
    expect(fake.calls).toContainEqual(["gt", ["created_at", "2026-10-08T12:00:00.000Z"]]);
  });

  it("is null when the count could not be read", async () => {
    expect(
      await countInvitesSince(fakeQuery({ count: null, error: LEAKY }).client, INVITER, new Date()),
    ).toBeNull();
    expect(
      await countInvitesSince(fakeQuery({ count: null }).client, INVITER, new Date()),
    ).toBeNull();
  });
});

describe("revokeOrgInvite", () => {
  it.each(["revoked", "already_accepted", "not_found"] as const)(
    "passes on the function's answer %s",
    async (answer) => {
      const fake = fakeRpc({ data: answer });
      expect(await revokeOrgInvite(fake.client, INVITE)).toBe(answer);
      expect(fake.rpc).toHaveBeenCalledWith("revoke_org_invite", { p_invite: INVITE });
    },
  );

  it("is failed on an error, logging the code only", async () => {
    expect(await revokeOrgInvite(fakeRpc({ data: null, error: LEAKY }).client, INVITE)).toBe(
      "failed",
    );
    expect(logText()).toContain("42501");
    expect(logText()).not.toContain(ADDRESS);
  });

  it("is failed on an answer it does not know", async () => {
    expect(await revokeOrgInvite(fakeRpc({ data: "something_new" }).client, INVITE)).toBe("failed");
  });
});

describe("createOrgInvite", () => {
  it("names the verified inviter and the address, and returns the invitation", async () => {
    const fake = fakeRpc({
      data: [
        {
          status: "created",
          invite_id: INVITE,
          token: TOKEN,
          expires_at: "2026-10-16T10:00:00Z",
        },
      ],
    });
    expect(await createOrgInvite(fake.client, INVITER, ADDRESS)).toEqual({
      status: "created",
      inviteId: INVITE,
      token: TOKEN,
    });
    expect(fake.rpc).toHaveBeenCalledWith("create_org_invite", {
      p_inviter: INVITER,
      p_email: ADDRESS,
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it.each(INVITE_REFUSALS)("passes on the refusal %s with nothing else", async (status) => {
    const fake = fakeRpc({ data: [{ status, invite_id: null, token: null, expires_at: null }] });
    expect(await createOrgInvite(fake.client, INVITER, ADDRESS)).toEqual({ status });
  });

  it("is failed on an error, and logs neither the address nor the database's text", async () => {
    const fake = fakeRpc({ data: null, error: LEAKY });
    expect(await createOrgInvite(fake.client, INVITER, ADDRESS)).toEqual({ status: "failed" });
    expect(logText()).toContain("42501");
    expect(logText()).not.toContain(ADDRESS);
    expect(logText()).not.toContain(TOKEN);
  });

  it.each([
    ["no row", []],
    ["an unknown status", [{ status: "something_new", invite_id: INVITE, token: TOKEN }]],
    ["created without a token", [{ status: "created", invite_id: INVITE, token: null }]],
    ["created without an id", [{ status: "created", invite_id: null, token: TOKEN }]],
  ])("is failed on %s, and logs no token", async (_what, data) => {
    expect(await createOrgInvite(fakeRpc({ data }).client, INVITER, ADDRESS)).toEqual({
      status: "failed",
    });
    expect(logText()).not.toContain(TOKEN);
  });
});
