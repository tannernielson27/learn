import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendConfirmationLink,
  signUpForInvite,
  type InviteSignUpDeps,
  type InviteSignUpInput,
} from "./inviteSignUp";

const INPUT: InviteSignUpInput = {
  email: "nurse@school.edu",
  password: "correct horse",
  displayName: "Ana Reyes",
  classId: "00000000-0000-4000-8000-0000000000c1",
};

const NEW_USER = "00000000-0000-4000-8000-0000000000a1";

function deps(overrides: Partial<InviteSignUpDeps> = {}): InviteSignUpDeps {
  return {
    createUser: vi.fn(async () => ({ data: { user: { id: NEW_USER } }, error: null })),
    saveName: vi.fn(async () => ({ error: null })),
    signIn: vi.fn(async () => ({ error: null })),
    join: vi.fn(async () => "joined" as const),
    ...overrides,
  };
}

const logged = vi.spyOn(console, "error").mockImplementation(() => {});
beforeEach(() => logged.mockClear());

describe("signUpForInvite", () => {
  it("creates a new student in the class, marked unconfirmed, and signs them in", async () => {
    const d = deps();
    expect(await signUpForInvite(INPUT, d)).toEqual({ status: "created" });
    expect(d.createUser).toHaveBeenCalledWith({
      email: INPUT.email,
      password: INPUT.password,
      email_confirm: true,
      app_metadata: { learn_invite: { class_id: INPUT.classId }, learn_email_unconfirmed: true },
    });
    expect(d.signIn).toHaveBeenCalledWith({ email: INPUT.email, password: INPUT.password });
    // The database put the new account in the class; there is nothing to join.
    expect(d.join).not.toHaveBeenCalled();
    // The name goes on the new account's own profile row, which the database made with it.
    expect(d.saveName).toHaveBeenCalledWith(NEW_USER, "Ana Reyes");
  });

  it("still lets the student in when the name could not be saved, and logs no name", async () => {
    const failing = deps({ saveName: vi.fn(async () => ({ error: { code: "PGRST000" } })) });
    expect(await signUpForInvite(INPUT, failing)).toEqual({ status: "created" });
    const throwing = deps({
      saveName: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    expect(await signUpForInvite(INPUT, throwing)).toEqual({ status: "created" });
    const unnamed = deps({
      createUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    });
    expect(await signUpForInvite(INPUT, unnamed)).toEqual({ status: "created" });
    expect(unnamed.saveName).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("Ana Reyes");
  });

  it("says the account is ready when it was made but could not be signed in here", async () => {
    const d = deps({ signIn: vi.fn(async () => ({ error: { status: 500 } })) });
    expect(await signUpForInvite(INPUT, d)).toEqual({ status: "created_signed_out" });
    expect(d.saveName).toHaveBeenCalledWith(NEW_USER, "Ana Reyes");
  });

  it("signs an existing account in with its own password and joins the class", async () => {
    const d = deps({ createUser: vi.fn(async () => ({ error: { code: "email_exists" } })) });
    expect(await signUpForInvite(INPUT, d)).toEqual({ status: "signed_in", joined: true });
    expect(d.join).toHaveBeenCalledTimes(1);
    // An existing account is never changed here, its name included.
    expect(d.saveName).not.toHaveBeenCalled();
  });

  it.each(["instructor", "invalid", "rate_limited", "unavailable"] as const)(
    "leaves a %s join answer for the invite page to explain",
    async (answer) => {
      const d = deps({
        createUser: vi.fn(async () => ({ error: { code: "email_exists" } })),
        join: vi.fn(async () => answer),
      });
      expect(await signUpForInvite(INPUT, d)).toEqual({ status: "signed_in", joined: false });
    },
  );

  it("says the address has an account when the password is not that account's", async () => {
    const d = deps({
      createUser: vi.fn(async () => ({ error: { code: "email_exists" } })),
      signIn: vi.fn(async () => ({ error: { code: "invalid_credentials" } })),
    });
    expect(await signUpForInvite(INPUT, d)).toEqual({ status: "exists" });
    expect(d.join).not.toHaveBeenCalled();
  });

  it("passes on Supabase's verdict that a password is too weak", async () => {
    const d = deps({ createUser: vi.fn(async () => ({ error: { code: "weak_password" } })) });
    expect(await signUpForInvite(INPUT, d)).toEqual({ status: "weak" });
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it("answers any other failure, or a throw, generically and logs no address or password", async () => {
    const failing = deps({
      createUser: vi.fn(async () => ({ error: { code: "unexpected_failure", status: 500 } })),
    });
    expect(await signUpForInvite(INPUT, failing)).toEqual({ status: "failed" });
    const throwing = deps({
      createUser: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    expect(await signUpForInvite(INPUT, throwing)).toEqual({ status: "failed" });
    const text = JSON.stringify(logged.mock.calls);
    expect(text).not.toContain("school.edu");
    expect(text).not.toContain("correct horse");
  });
});

describe("sendConfirmationLink", () => {
  it("emails the sign-in link, landing on the student home", async () => {
    const sendLink = vi.fn(async () => ({ error: null }));
    await sendConfirmationLink("nurse@school.edu", "https://learn.example", sendLink);
    expect(sendLink).toHaveBeenCalledWith({
      email: "nurse@school.edu",
      redirectTo: "https://learn.example/auth/confirm?next=%2Flearn",
    });
  });

  it("never throws: a failure is logged without the address", async () => {
    await sendConfirmationLink("nurse@school.edu", "https://learn.example", async () => ({
      error: { status: 429, code: "over_email_send_rate_limit" },
    }));
    await sendConfirmationLink("nurse@school.edu", "https://learn.example", async () => {
      throw new Error("network");
    });
    expect(logged).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("school.edu");
  });
});
