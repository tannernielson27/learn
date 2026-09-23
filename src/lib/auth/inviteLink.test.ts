import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendInviteLink, type InviteLinkDeps } from "./inviteLink";

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const CLASS_ID = "00000000-0000-0000-0000-0000002050c1";
const INPUT = {
  email: "nurse@school.edu",
  classId: CLASS_ID,
  token: TOKEN,
  origin: "https://learn.example",
};

function deps(createError: { code?: string; status?: number } | null = null) {
  return {
    createUser: vi.fn(async () => ({ error: createError })),
    sendLink: vi.fn(async () => ({ error: null as { code?: string; status?: number } | null })),
  } satisfies InviteLinkDeps;
}

const logged = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  logged.mockClear();
});

describe("sendInviteLink", () => {
  it("creates the account with the invite in app_metadata, confirmed, and nothing else", async () => {
    const d = deps();
    await sendInviteLink(INPUT, d);
    expect(d.createUser).toHaveBeenCalledWith({
      email: "nurse@school.edu",
      email_confirm: true,
      app_metadata: { learn_invite: { class_id: CLASS_ID } },
    });
  });

  it("sends a new student's link on to the student home", async () => {
    const d = deps();
    await sendInviteLink(INPUT, d);
    expect(d.sendLink).toHaveBeenCalledWith({
      email: "nurse@school.edu",
      redirectTo: "https://learn.example/auth/confirm?next=%2Flearn",
    });
  });

  it("sends an existing account back to the invite, where it joins with one tap or is told it is an instructor", async () => {
    const d = deps({ code: "email_exists", status: 422 });
    await sendInviteLink(INPUT, d);
    expect(d.sendLink).toHaveBeenCalledWith({
      email: "nurse@school.edu",
      redirectTo: `https://learn.example/auth/confirm?next=%2Fc%2F${TOKEN}`,
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("sends nothing when the account could not be created for any other reason, and logs it without the address", async () => {
    const d = deps({ code: "unexpected_failure", status: 500 });
    await sendInviteLink(INPUT, d);
    expect(d.sendLink).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("nurse@school.edu");
  });

  it("logs a failed send without the address", async () => {
    const d = deps();
    d.sendLink.mockResolvedValueOnce({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    await sendInviteLink(INPUT, d);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("nurse@school.edu");
  });

  it("never throws: a thrown client error is logged, because it runs after the response", async () => {
    const d = deps();
    d.createUser.mockRejectedValueOnce(new Error("network down"));
    await expect(sendInviteLink(INPUT, d)).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
