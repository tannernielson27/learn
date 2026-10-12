import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcceptOrgInviteResult } from "@/lib/supabase/orgInvites";
import {
  acceptAsSignedIn,
  createAndAccept,
  type AcceptAsSignedInDeps,
  type AcceptAsSignedInInput,
  type CreateAndAcceptDeps,
} from "./acceptInvite";
import { ORG_INVITE_LIFETIME_MS } from "./invite";

const USER = "00000000-0000-4000-8000-0000000000a1";
const EXPIRES = "2026-10-16T12:00:00.000Z";
const ISSUED = Date.parse(EXPIRES) - ORG_INVITE_LIFETIME_MS;
const sessionAt = (ms: number) => ({ amr: [{ method: "password", timestamp: ms / 1000 }] });
/** Signed in a day before the invitation existed. */
const OLD_SESSION = sessionAt(ISSUED - 86_400_000);
/** Signed in after opening the link. */
const NEW_SESSION = sessionAt(ISSUED + 3_600_000);

const logged = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  logged.mockClear();
});

function signedInDeps(result: AcceptOrgInviteResult = "accepted") {
  const calls: string[] = [];
  const deps = {
    accept: vi.fn<AcceptAsSignedInDeps["accept"]>(async () => {
      calls.push("accept");
      return result;
    }),
    clearUnconfirmed: vi.fn<AcceptAsSignedInDeps["clearUnconfirmed"]>(async () => {
      calls.push("clear");
      return { error: null as unknown };
    }),
    refresh: vi.fn(async () => {
      calls.push("refresh");
      return { error: null as unknown };
    }),
    earlierAccess: {
      replacePassword: vi.fn<(password: string) => Promise<{ error: unknown }>>(async () => {
        calls.push("replacePassword");
        return { error: null as unknown };
      }),
      signOutOthers: vi.fn(async () => {
        calls.push("signOutOthers");
        return { error: null as unknown };
      }),
      randomPassword: () => "a-password-nobody-knows",
    },
  } satisfies AcceptAsSignedInDeps;
  return { deps, calls };
}

const input = (over: Partial<AcceptAsSignedInInput> = {}): AcceptAsSignedInInput => ({
  userId: USER,
  wasUnconfirmed: false,
  claims: OLD_SESSION,
  inviteExpiresAt: EXPIRES,
  ...over,
});

describe("acceptAsSignedIn", () => {
  it("accepts for the verified account and sends a long-signed-in teacher to authoring", async () => {
    const { deps, calls } = signedInDeps();
    expect(await acceptAsSignedIn(input(), deps)).toEqual({
      result: "accepted",
      next: "/author",
      endedEarlierAccess: false,
    });
    expect(deps.accept).toHaveBeenCalledWith(USER);
    // The session is refreshed so it sees the new role; nothing else is touched.
    expect(calls).toEqual(["accept", "refresh"]);
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
    "admin_account",
    "teaches_shared",
    "founder_with_members",
    "students_depend",
    "move_needs_confirmation",
    "shared_workspace",
    "members_full",
    "unavailable",
  ] as const)("changes nothing at all when the answer is %s", async (result) => {
    const { deps, calls } = signedInDeps(result);
    const outcome = await acceptAsSignedIn(
      input({ wasUnconfirmed: true, claims: NEW_SESSION }),
      deps,
    );
    expect(outcome).toEqual({ result });
    expect(calls).toEqual(["accept"]);
    expect(deps.clearUnconfirmed).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
    expect(deps.earlierAccess.replacePassword).not.toHaveBeenCalled();
    expect(deps.earlierAccess.signOutOthers).not.toHaveBeenCalled();
  });

  describe("an account someone else may have made (the squatter)", () => {
    it("ends earlier access for an unconfirmed account, even one signed in here all along", async () => {
      const { deps, calls } = signedInDeps();
      const outcome = await acceptAsSignedIn(
        input({ wasUnconfirmed: true, claims: OLD_SESSION }),
        deps,
      );
      expect(outcome).toEqual({
        result: "accepted",
        next: "/account/password?next=%2Fauthor&confirmed=1",
        endedEarlierAccess: true,
      });
      // Confirmed, then refreshed, then the password retired and the other sessions ended: the
      // order #378 found to leave this session able to choose a new password.
      expect(calls).toEqual(["accept", "clear", "refresh", "replacePassword", "signOutOthers"]);
      expect(deps.clearUnconfirmed).toHaveBeenCalledWith(USER);
      expect(deps.earlierAccess.replacePassword).toHaveBeenCalledWith("a-password-nobody-knows");
    });

    it("ends earlier access for a confirmed account whose session was made for this visit", async () => {
      const { deps, calls } = signedInDeps();
      const outcome = await acceptAsSignedIn(input({ claims: NEW_SESSION }), deps);
      expect(outcome).toMatchObject({
        next: "/account/password?next=%2Fauthor&confirmed=1",
        endedEarlierAccess: true,
      });
      // Nothing to clear: the address was already confirmed.
      expect(calls).toEqual(["accept", "refresh", "replacePassword", "signOutOthers"]);
    });

    it("ends earlier access when the session does not say when it was made", async () => {
      const { deps } = signedInDeps();
      const outcome = await acceptAsSignedIn(input({ claims: null }), deps);
      expect(outcome).toMatchObject({ endedEarlierAccess: true });
      expect(deps.earlierAccess.replacePassword).toHaveBeenCalledOnce();
      expect(deps.earlierAccess.signOutOthers).toHaveBeenCalledOnce();
    });

    it("still signs the other sessions out when the password could not be replaced", async () => {
      const { deps } = signedInDeps();
      deps.earlierAccess.replacePassword.mockResolvedValueOnce({ error: { status: 500 } });
      const outcome = await acceptAsSignedIn(input({ wasUnconfirmed: true }), deps);
      expect(outcome).toMatchObject({ result: "accepted", endedEarlierAccess: true });
      expect(deps.earlierAccess.signOutOthers).toHaveBeenCalledOnce();
    });

    it("still ends earlier access when the key could not be cleared or the refresh failed", async () => {
      const { deps } = signedInDeps();
      deps.clearUnconfirmed.mockRejectedValueOnce(new Error("network"));
      deps.refresh.mockResolvedValueOnce({ error: { status: 500 } });
      const outcome = await acceptAsSignedIn(input({ wasUnconfirmed: true }), deps);
      expect(outcome).toMatchObject({ result: "accepted", endedEarlierAccess: true });
      expect(deps.earlierAccess.replacePassword).toHaveBeenCalledOnce();
    });
  });

  it("is unavailable, with nothing changed, when accepting throws", async () => {
    const { deps, calls } = signedInDeps();
    deps.accept.mockRejectedValueOnce(new Error("network"));
    expect(await acceptAsSignedIn(input({ wasUnconfirmed: true }), deps)).toEqual({
      result: "unavailable",
    });
    expect(calls).toEqual([]);
  });

  it("never logs the account's id or the password it sets", async () => {
    const { deps } = signedInDeps();
    deps.clearUnconfirmed.mockResolvedValueOnce({ error: { status: 500, message: USER } });
    deps.earlierAccess.replacePassword.mockResolvedValueOnce({ error: { status: 422 } });
    await acceptAsSignedIn(input({ wasUnconfirmed: true }), deps);
    const said = JSON.stringify(logged.mock.calls);
    expect(said).not.toContain(USER);
    expect(said).not.toContain("a-password-nobody-knows");
  });
});

function createDeps(result: AcceptOrgInviteResult = "accepted") {
  const calls: string[] = [];
  const deps = {
    createUser: vi.fn<CreateAndAcceptDeps["createUser"]>(async () => {
      calls.push("createUser");
      return { data: { user: { id: USER } }, error: null };
    }),
    saveName: vi.fn<CreateAndAcceptDeps["saveName"]>(async () => {
      calls.push("saveName");
      return { error: null as unknown };
    }),
    accept: vi.fn<CreateAndAcceptDeps["accept"]>(async () => {
      calls.push("accept");
      return result;
    }),
    signIn: vi.fn<CreateAndAcceptDeps["signIn"]>(async () => {
      calls.push("signIn");
      return { error: null as unknown };
    }),
  } satisfies CreateAndAcceptDeps;
  return { deps, calls };
}

const NEW = { email: "grace@school.edu", password: "correct horse battery", displayName: "Grace" };

describe("acceptAsSignedIn, for a move", () => {
  it("signs out the other sessions and nothing else, for an account plainly its owner's", async () => {
    const { deps, calls } = signedInDeps();
    expect(await acceptAsSignedIn(input({ move: true }), deps)).toEqual({
      result: "accepted",
      next: "/author",
      endedEarlierAccess: false,
    });
    expect(calls).toEqual(["accept", "refresh", "signOutOthers"]);
    expect(deps.earlierAccess.replacePassword).not.toHaveBeenCalled();
  });

  it("signs them out once, with the password, when earlier access is ended too", async () => {
    const { deps, calls } = signedInDeps();
    const outcome = await acceptAsSignedIn(input({ move: true, claims: NEW_SESSION }), deps);
    expect(outcome).toMatchObject({ result: "accepted", endedEarlierAccess: true });
    expect(calls.filter((call) => call === "signOutOthers")).toHaveLength(1);
    expect(deps.earlierAccess.replacePassword).toHaveBeenCalledOnce();
  });

  it("signs nobody out when the database did not move the account", async () => {
    const { deps, calls } = signedInDeps("students_depend");
    await acceptAsSignedIn(input({ move: true }), deps);
    expect(calls).toEqual(["accept"]);
  });

  it("still lands the teacher when signing the others out fails or throws", async () => {
    for (const failure of [
      async () => ({ error: { status: 500 } }),
      async () => Promise.reject(new Error("down")),
    ]) {
      const { deps } = signedInDeps();
      deps.earlierAccess.signOutOthers.mockImplementationOnce(failure as never);
      expect(await acceptAsSignedIn(input({ move: true }), deps)).toMatchObject({
        result: "accepted",
        next: "/author",
      });
    }
  });
});

describe("createAndAccept", () => {
  it("makes the account, names it, accepts for the id it was given and signs in", async () => {
    const { deps, calls } = createDeps();
    expect(await createAndAccept(NEW, deps)).toEqual({
      status: "created",
      result: "accepted",
      signedIn: true,
    });
    expect(calls).toEqual(["createUser", "saveName", "accept", "signIn"]);
    expect(deps.saveName).toHaveBeenCalledWith(USER, "Grace");
    expect(deps.accept).toHaveBeenCalledWith(USER);
    expect(deps.signIn).toHaveBeenCalledWith({ email: NEW.email, password: NEW.password });
  });

  it("makes the account confirmed, without the unconfirmed key: the link went to its inbox", async () => {
    const { deps } = createDeps();
    await createAndAccept(NEW, deps);
    expect(deps.createUser).toHaveBeenCalledWith({
      email: NEW.email,
      password: NEW.password,
      email_confirm: true,
    });
    expect(JSON.stringify(deps.createUser.mock.calls)).not.toContain("learn_email_unconfirmed");
  });

  it("only says so when the address has an account: no accept, no sign-in, no password tried", async () => {
    const { deps, calls } = createDeps();
    deps.createUser.mockResolvedValueOnce({ error: { code: "email_exists", status: 422 } });
    expect(await createAndAccept(NEW, deps)).toEqual({ status: "exists" });
    expect(deps.createUser).toHaveBeenCalledOnce();
    // Nothing after the refusal: no name saved, no accept, no sign-in.
    expect(calls).toEqual([]);
  });

  it("reports a password Supabase finds weak, and any other refusal as failed", async () => {
    const { deps } = createDeps();
    deps.createUser.mockResolvedValueOnce({ error: { code: "weak_password" } });
    expect(await createAndAccept(NEW, deps)).toEqual({ status: "weak" });
    deps.createUser.mockResolvedValueOnce({ error: { code: "unexpected_failure", status: 500 } });
    expect(await createAndAccept(NEW, deps)).toEqual({ status: "failed" });
    deps.createUser.mockRejectedValueOnce(new Error("network"));
    expect(await createAndAccept(NEW, deps)).toEqual({ status: "failed" });
    expect(deps.accept).not.toHaveBeenCalled();
  });

  it("hands back what the database answered when the invitation closed meanwhile", async () => {
    const { deps } = createDeps("members_full");
    expect(await createAndAccept(NEW, deps)).toEqual({
      status: "created",
      result: "members_full",
      signedIn: true,
    });
  });

  it("accepts even when the name could not be saved", async () => {
    const { deps } = createDeps();
    deps.saveName.mockRejectedValueOnce(new Error("network"));
    expect(await createAndAccept(NEW, deps)).toMatchObject({ result: "accepted" });
  });

  it("says when the browser could not be signed in to the new account", async () => {
    const { deps } = createDeps();
    deps.signIn.mockResolvedValueOnce({ error: { status: 500 } });
    expect(await createAndAccept(NEW, deps)).toEqual({
      status: "created",
      result: "accepted",
      signedIn: false,
    });
  });

  it("never accepts for an id it was not given", async () => {
    const { deps } = createDeps();
    deps.createUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await createAndAccept(NEW, deps)).toEqual({
      status: "created",
      result: "unavailable",
      signedIn: true,
    });
    expect(deps.accept).not.toHaveBeenCalled();
  });

  it("never logs the address, the name or the password", async () => {
    const { deps } = createDeps();
    deps.createUser.mockResolvedValueOnce({ error: { code: "unexpected_failure", status: 500 } });
    await createAndAccept(NEW, deps);
    const said = JSON.stringify(logged.mock.calls);
    for (const secret of Object.values(NEW)) expect(said).not.toContain(secret);
  });
});
