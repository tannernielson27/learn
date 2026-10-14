import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailError, type EmailMessage, type Mailer } from "@/lib/email";
import { WORKSPACE_INVITE_SUBJECT } from "@/lib/email/templates/workspaceInvite";
import {
  sendWorkspaceInviteEmail,
  workspaceInviteLink,
  type WorkspaceInvite,
  type WorkspaceInviteEmailDeps,
} from "./inviteEmail";

const TOKEN = "Qm9fLXRva2VuLTAxMjM0NTY3ODlhYmNk";
const INVITE: WorkspaceInvite = {
  inviteId: "00000000-0000-4000-8000-000000001001",
  token: TOKEN,
  to: "colleague@school.edu",
  inviterId: "00000000-0000-4000-8000-0000000000a1",
  inviterEmail: "ada@school.edu",
  workspaceName: "Adult Health",
};

// A request whose Host a caller forged, arriving at production, where SITE_URL is the truth.
const FORGED = new Headers({ host: "evil.example", "x-forwarded-proto": "https" });
const PRODUCTION = { VERCEL_ENV: "production", SITE_URL: "https://learn.example" };

function mailer(send: Mailer["send"] = async () => ({ id: "m-1" })): Mailer & {
  send: ReturnType<typeof vi.fn>;
} {
  return { send: vi.fn(send) };
}

function deps(overrides: Partial<WorkspaceInviteEmailDeps> = {}): WorkspaceInviteEmailDeps {
  return {
    requestHeaders: FORGED,
    env: PRODUCTION,
    mailer: mailer(),
    allow: vi.fn(async () => "ok" as const),
    ...overrides,
  };
}

function sentMessage(d: WorkspaceInviteEmailDeps): EmailMessage {
  return vi.mocked(d.mailer.send).mock.calls[0]![0];
}

const logged = vi.spyOn(console, "error").mockImplementation(() => {});
beforeEach(() => logged.mockClear());

describe("workspaceInviteLink", () => {
  it("is /w/<token> on the origin it is given", () => {
    expect(workspaceInviteLink("https://learn.example", TOKEN)).toBe(
      `https://learn.example/w/${TOKEN}`,
    );
  });

  it.each(["", "short", "../author", "a/b".repeat(8), `${TOKEN}?next=//evil.example`])(
    "refuses %j, which is not a token, rather than build a link from it",
    (token) => {
      expect(() => workspaceInviteLink("https://learn.example", token)).toThrow(/token/);
    },
  );
});

describe("sendWorkspaceInviteEmail", () => {
  it("mails the invitation to the invited address through the app mailer", async () => {
    const d = deps();
    expect(await sendWorkspaceInviteEmail(INVITE, d)).toBe("sent");
    const message = sentMessage(d);
    expect(message.to).toBe(INVITE.to);
    expect(message.subject).toBe(WORKSPACE_INVITE_SUBJECT);
    expect(message.html).toContain("Accept the invitation");
    expect(message.text).toContain("ada@school.edu invited you");
    expect(message.text).toContain('"Adult Health"');
  });

  it("puts the link on the canonical origin, never the one the request names", async () => {
    const d = deps();
    await sendWorkspaceInviteEmail(INVITE, d);
    const { html, text } = sentMessage(d);
    expect(text).toContain(`Accept the invitation: https://learn.example/w/${TOKEN}`);
    expect(html).not.toContain("evil.example");
    expect(text).not.toContain("evil.example");
  });

  it("counts the send against the inviter's account", async () => {
    const d = deps();
    await sendWorkspaceInviteEmail(INVITE, d);
    expect(d.allow).toHaveBeenCalledExactlyOnceWith(INVITE.inviterId);
  });

  it("keys the send on the invitation, so a retry is not a second email", async () => {
    const d = deps();
    await sendWorkspaceInviteEmail(INVITE, d);
    await sendWorkspaceInviteEmail(INVITE, d);
    const keys = vi.mocked(d.mailer.send).mock.calls.map(([message]) => message.idempotencyKey);
    expect(keys).toEqual([
      `workspace-invite:${INVITE.inviteId}`,
      `workspace-invite:${INVITE.inviteId}`,
    ]);
    // Never an address or the token, which would reach the provider as a header.
    expect(keys.join()).not.toContain("school.edu");
    expect(keys.join()).not.toContain(TOKEN);
  });

  it.each(["rate_limited", "ceiling"] as const)(
    "sends nothing and answers %s when that limit refuses",
    async (refusal) => {
      const d = deps({ allow: vi.fn(async () => refusal) });
      expect(await sendWorkspaceInviteEmail(INVITE, d)).toBe(refusal);
      expect(d.mailer.send).not.toHaveBeenCalled();
    },
  );

  it("sends nothing when the limiter cannot answer", async () => {
    const d = deps({ allow: vi.fn(async () => "unavailable" as const) });
    expect(await sendWorkspaceInviteEmail(INVITE, d)).toBe("failed");
    expect(d.mailer.send).not.toHaveBeenCalled();
  });

  it("never throws: a mailer error is logged and answered failed", async () => {
    const d = deps({
      mailer: mailer(async () => {
        throw new EmailError("config", "RESEND_API_KEY is not set.");
      }),
    });
    await expect(sendWorkspaceInviteEmail(INVITE, d)).resolves.toBe("failed");
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).toContain("config");
  });

  it("never throws when the limiter itself throws", async () => {
    const d = deps({
      allow: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    await expect(sendWorkspaceInviteEmail(INVITE, d)).resolves.toBe("failed");
    expect(d.mailer.send).not.toHaveBeenCalled();
  });

  it("spends no limit and sends nothing for a token that is not one", async () => {
    const d = deps();
    expect(await sendWorkspaceInviteEmail({ ...INVITE, token: "../author" }, d)).toBe("failed");
    expect(d.allow).not.toHaveBeenCalled();
    expect(d.mailer.send).not.toHaveBeenCalled();
  });

  it("logs no address, no workspace name and no token, whatever fails", async () => {
    const failing = deps({
      mailer: mailer(async () => {
        throw new Error(
          `could not send to ${INVITE.to} from ${INVITE.inviterEmail} for ${INVITE.workspaceName} with ${TOKEN}`,
        );
      }),
    });
    await sendWorkspaceInviteEmail(INVITE, failing);
    const text = JSON.stringify(logged.mock.calls);
    expect(text).not.toContain("school.edu");
    expect(text).not.toContain("Adult Health");
    expect(text).not.toContain(TOKEN);
  });
});
