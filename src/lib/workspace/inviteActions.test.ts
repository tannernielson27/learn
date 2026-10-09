import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatedInvite, FoundInvite, RevokedInvite } from "@/lib/supabase/workspace";
import { INVITE_REFUSALS } from "@/lib/supabase/workspace";
import {
  EARLIER_REVOKED,
  INVITE_ACCEPTED,
  INVITE_GONE,
  INVITE_NOT_MADE,
  INVITE_REFUSAL_MESSAGES,
  notSentMessage,
  resendInvitation,
  RESEND_AT_LIMIT,
  RESEND_BAD_ADDRESS,
  RESEND_FAILED,
  RESEND_RECIPIENT_LIMIT,
  REVOKE_FAILED,
  revokeInvitation,
  sendInvitation,
  type ResendDeps,
} from "./invite";
import type { WorkspaceInviteEmailResult } from "./inviteEmail";

/**
 * The three things a teacher does on the workspace page, with the database and the mailer faked.
 * What is pinned: the order of the steps, that the token goes to the mailer and nowhere else, and
 * that an email which did not go out leaves no invitation behind.
 */

const INVITER = { id: "inviter-1", email: "ada@school.edu", workspaceName: "Ada's workspace" };
const ADDRESS = "kim@school.edu";
const INVITE = "00000000-0000-4000-8000-0000000000e1";
const OLD_INVITE = "00000000-0000-4000-8000-0000000000e0";
const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const NOW = new Date("2026-10-09T12:00:00Z");

const steps: string[] = [];
let created: CreatedInvite;
let sent: WorkspaceInviteEmailResult;
let revoked: RevokedInvite;
let found: FoundInvite;
let recent: number | null;
let received: number | null;

const create = vi.fn<ResendDeps["create"]>(async () => {
  steps.push("create");
  return created;
});
const revoke = vi.fn<ResendDeps["revoke"]>(async () => {
  steps.push("revoke");
  return revoked;
});
const send = vi.fn<ResendDeps["send"]>(async () => {
  steps.push("send");
  return sent;
});
const find = vi.fn<ResendDeps["find"]>(async () => {
  steps.push("find");
  return found;
});
const recentCount = vi.fn<ResendDeps["recentCount"]>(async () => {
  steps.push("count");
  return recent;
});
const recipientCount = vi.fn<ResendDeps["recipientCount"]>(async () => {
  steps.push("recipient");
  return received;
});
const deps: ResendDeps = {
  create,
  revoke,
  send,
  find,
  recentCount,
  recipientCount,
  now: () => NOW,
};

const logged = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  steps.length = 0;
  created = { status: "created", inviteId: INVITE, token: TOKEN };
  sent = "sent";
  revoked = "revoked";
  found = { email: ADDRESS };
  recent = 0;
  received = 1;
});

describe("sendInvitation", () => {
  it("makes the invitation for the verified inviter and emails it", async () => {
    expect(await sendInvitation(INVITER, ADDRESS, deps)).toEqual({ ok: true, email: ADDRESS });
    expect(create).toHaveBeenCalledWith(INVITER.id, ADDRESS);
    expect(send).toHaveBeenCalledWith({
      inviteId: INVITE,
      token: TOKEN,
      to: ADDRESS,
      inviterId: INVITER.id,
      inviterEmail: INVITER.email,
      workspaceName: INVITER.workspaceName,
    });
    expect(steps).toEqual(["create", "send"]);
  });

  it("never puts the token in what it returns, on any path", async () => {
    const outcomes = [await sendInvitation(INVITER, ADDRESS, deps)];
    for (const result of ["rate_limited", "ceiling", "failed"] as const) {
      sent = result;
      outcomes.push(await sendInvitation(INVITER, ADDRESS, deps));
    }
    revoked = "failed";
    outcomes.push(await sendInvitation(INVITER, ADDRESS, deps));
    expect(JSON.stringify(outcomes)).not.toContain(TOKEN);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN);
  });

  it.each(INVITE_REFUSALS)("says why on %s, and sends nothing", async (status) => {
    created = { status };
    expect(await sendInvitation(INVITER, ADDRESS, deps)).toEqual({
      ok: false,
      message: INVITE_REFUSAL_MESSAGES[status],
    });
    expect(steps).toEqual(["create"]);
  });

  it("has a different sentence for every refusal", () => {
    const sentences = INVITE_REFUSALS.map((status) => INVITE_REFUSAL_MESSAGES[status]);
    expect(new Set(sentences).size).toBe(INVITE_REFUSALS.length);
    for (const sentence of sentences) expect(sentence.length).toBeGreaterThan(20);
  });

  it("says the invitation could not be made when the database does not answer", async () => {
    created = { status: "failed" };
    expect(await sendInvitation(INVITER, ADDRESS, deps)).toEqual({
      ok: false,
      message: INVITE_NOT_MADE,
    });
    expect(steps).toEqual(["create"]);
  });

  it.each(["rate_limited", "ceiling", "failed"] as const)(
    "revokes the invitation it just made when the email is %s, and says it was not sent",
    async (result) => {
      sent = result;
      expect(await sendInvitation(INVITER, ADDRESS, deps)).toEqual({
        ok: false,
        message: notSentMessage(result, true),
      });
      expect(revoke).toHaveBeenCalledWith(INVITE);
      expect(steps).toEqual(["create", "send", "revoke"]);
    },
  );

  it("says the invitation is still listed when it could not be revoked either", async () => {
    sent = "failed";
    revoked = "failed";
    const outcome = await sendInvitation(INVITER, ADDRESS, deps);
    expect(outcome).toEqual({ ok: false, message: notSentMessage("failed", false) });
    expect(JSON.stringify(outcome)).toContain("still listed");
  });

  it("treats a mailer that throws as an email that was not sent, logging only a name", async () => {
    send.mockRejectedValueOnce(new Error(`could not reach ${ADDRESS} with ${TOKEN}`));
    expect(await sendInvitation(INVITER, ADDRESS, deps)).toEqual({
      ok: false,
      message: notSentMessage("failed", true),
    });
    expect(revoke).toHaveBeenCalledWith(INVITE);
    const log = JSON.stringify(logged.mock.calls);
    expect(log).toContain("Error");
    expect(log).not.toContain(TOKEN);
    expect(log).not.toContain(ADDRESS);
  });

  it("treats a database call that throws as an invitation that was not made", async () => {
    create.mockRejectedValueOnce(new Error("SUPABASE_SECRET_KEY is not set"));
    expect(await sendInvitation(INVITER, ADDRESS, deps)).toEqual({
      ok: false,
      message: INVITE_NOT_MADE,
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("notSentMessage", () => {
  it("says the email was not sent and what is left, for every send result", () => {
    for (const result of ["rate_limited", "ceiling", "failed"] as const) {
      expect(notSentMessage(result, true)).toMatch(/not sent|could not be sent/);
      expect(notSentMessage(result, true)).toContain("No invitation is pending");
      expect(notSentMessage(result, false)).toContain("Revoke it before you try again");
    }
    expect(notSentMessage("rate_limited", true)).toContain("tomorrow");
    expect(notSentMessage("ceiling", true)).toContain("in an hour");
  });
});

describe("revokeInvitation", () => {
  it("is ok when the function revoked it", async () => {
    expect(await revokeInvitation(INVITE, deps)).toEqual({ ok: true });
    expect(revoke).toHaveBeenCalledWith(INVITE);
  });

  it.each([
    ["already_accepted", INVITE_ACCEPTED],
    ["not_found", INVITE_GONE],
    ["failed", REVOKE_FAILED],
  ] as const)("says so on %s", async (answer, message) => {
    revoked = answer;
    expect(await revokeInvitation(INVITE, deps)).toEqual({ ok: false, message });
  });

  it("never says an invitation belongs to somebody else", async () => {
    revoked = "not_found";
    const outcome = await revokeInvitation(INVITE, deps);
    expect(JSON.stringify(outcome)).not.toMatch(/not yours|another workspace|permission/i);
  });
});

describe("resendInvitation", () => {
  it("revokes the earlier invitation, then makes and emails a new one to the same address", async () => {
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({ ok: true, email: ADDRESS });
    expect(steps).toEqual(["find", "count", "recipient", "revoke", "create", "send"]);
    expect(find).toHaveBeenCalledWith(OLD_INVITE);
    expect(revoke).toHaveBeenCalledWith(OLD_INVITE);
    expect(create).toHaveBeenCalledWith(INVITER.id, ADDRESS);
    expect(send.mock.calls[0]![0]).toMatchObject({ inviteId: INVITE, to: ADDRESS, token: TOKEN });
  });

  it("counts the inviter's last 24 hours", async () => {
    await resendInvitation(INVITER, OLD_INVITE, deps);
    expect(recentCount).toHaveBeenCalledWith(INVITER.id, new Date("2026-10-08T12:00:00Z"));
  });

  it.each([
    ["gone", INVITE_GONE],
    ["accepted", INVITE_ACCEPTED],
    ["failed", RESEND_FAILED],
  ] as const)("changes nothing when the invitation is %s", async (state, message) => {
    found = state;
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({ ok: false, message });
    expect(steps).toEqual(["find"]);
  });

  it("keeps the earlier invitation when the inviter is already at five for the day", async () => {
    recent = 5;
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({
      ok: false,
      message: RESEND_AT_LIMIT,
    });
    expect(steps).toEqual(["find", "count"]);
  });

  it("keeps the earlier invitation when the count could not be read", async () => {
    recent = null;
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({
      ok: false,
      message: RESEND_FAILED,
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it("counts the address's last 24 hours too", async () => {
    await resendInvitation(INVITER, OLD_INVITE, deps);
    expect(recipientCount).toHaveBeenCalledWith(ADDRESS, new Date("2026-10-08T12:00:00Z"));
  });

  it("keeps the earlier invitation when the address is already at three for the day", async () => {
    received = 3;
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({
      ok: false,
      message: RESEND_RECIPIENT_LIMIT,
    });
    expect(RESEND_RECIPIENT_LIMIT).toContain("The earlier invitation is unchanged");
    expect(steps).toEqual(["find", "count", "recipient"]);
  });

  it("keeps the earlier invitation when the address's count could not be read", async () => {
    received = null;
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({
      ok: false,
      message: RESEND_FAILED,
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it("says the earlier one is gone when other workspaces filled the address's three", async () => {
    // Only the database can count other workspaces' invitations, and it answers after the revoke.
    created = { status: "recipient_limited" };
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({
      ok: false,
      message: `${EARLIER_REVOKED} ${INVITE_REFUSAL_MESSAGES.recipient_limited}`,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("will not email a stored address the form would have refused", async () => {
    found = { email: "kim@school.edu,eve@evil.test" };
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({
      ok: false,
      message: RESEND_BAD_ADDRESS,
    });
    expect(steps).toEqual(["find"]);
  });

  it.each([
    ["already_accepted", INVITE_ACCEPTED],
    ["not_found", INVITE_GONE],
    ["failed", RESEND_FAILED],
  ] as const)("makes no new invitation when revoking answers %s", async (answer, message) => {
    revoked = answer;
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({ ok: false, message });
    expect(create).not.toHaveBeenCalled();
  });

  it("says the earlier one is gone when the new one is refused", async () => {
    created = { status: "rate_limited" };
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({
      ok: false,
      message: `${EARLIER_REVOKED} ${INVITE_REFUSAL_MESSAGES.rate_limited}`,
    });
  });

  it("revokes the new one too when its email does not go out", async () => {
    sent = "ceiling";
    expect(await resendInvitation(INVITER, OLD_INVITE, deps)).toEqual({
      ok: false,
      message: `${EARLIER_REVOKED} ${notSentMessage("ceiling", true)}`,
    });
    expect(revoke.mock.calls.map(([id]) => id)).toEqual([OLD_INVITE, INVITE]);
  });
});
