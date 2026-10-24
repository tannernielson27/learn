import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOIN_CODE_ERROR } from "@/lib/live/joinForm";
import {
  PARTICIPANT_COOKIE,
  PARTICIPANT_COOKIE_MAX_AGE_SECONDS,
  participantCookieOptions,
} from "@/lib/live/participantToken";
import type { ResolvedCode } from "@/lib/supabase/sessions";

/**
 * The Server Function is the seam where a typed code, a name and a cookie meet. What is worth
 * pinning here is the order and the decisions: the code is resolved before anything else, the
 * session id is never taken from the browser, a browser already in this room comes back instead
 * of joining twice, and the cookie that is written is the one the database just issued.
 */

const requestHeaders = new Headers({
  // Stamped by Vercel, so `clientIp` reads the address (see signInRateLimit.ts).
  "x-vercel-id": "iad1::test",
  "x-vercel-forwarded-for": "203.0.113.42",
});

interface WrittenCookie {
  value: string;
  options: Record<string, unknown>;
}

const jar = new Map<string, WrittenCookie>();
const cookieStore = {
  get: (name: string) => {
    const held = jar.get(name);
    return held ? { name, value: held.value } : undefined;
  },
  set: (name: string, value: string, options: Record<string, unknown>) => {
    jar.set(name, { value, options });
  },
};

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => cookieStore,
}));

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

const SERVICE_CLIENT = { marker: "service" };
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => SERVICE_CLIENT,
}));

const resolveSessionCode = vi.fn<(...args: unknown[]) => Promise<ResolvedCode>>();
vi.mock("@/lib/supabase/sessions", () => ({
  resolveSessionCode: (...args: unknown[]) => resolveSessionCode(...args),
}));

const joinSession = vi.fn();
const checkParticipant = vi.fn();
vi.mock("@/lib/supabase/participants", () => ({
  joinSession: (...args: unknown[]) => joinSession(...args),
  checkParticipant: (...args: unknown[]) => checkParticipant(...args),
}));

// ADR 0013: who is signed in, as the server verified it. Null is signed out.
const verifiedAccountId = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/supabase/verifiedAccount", () => ({
  verifiedAccountId: () => verifiedAccountId(),
}));

const { joinLiveSession } = await import("./actions");

const SESSION = "3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071";
const OTHER_SESSION = "11112222-3333-4444-8555-666677778888";
const PARTICIPANT = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SECRET = "a".repeat(48);
const MEMBER = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
const SOMEONE_ELSE = "0f1e2d3c-4b5a-4968-8776-655443322110";

const OPEN: ResolvedCode = {
  status: "open",
  sessionId: SESSION,
  sessionStatus: "lobby",
  mode: "instructor_paced",
  title: "Cardiac bank",
};

function form(code: string, displayName: string): FormData {
  const data = new FormData();
  data.set("code", code);
  data.set("displayName", displayName);
  return data;
}

/** Runs the action and returns the path it redirected to. */
async function joinAndFollow(data: FormData): Promise<string> {
  await expect(joinLiveSession({ status: "idle" }, data)).rejects.toThrow(/^redirect:/);
  return redirected.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  resolveSessionCode.mockResolvedValue(OPEN);
  joinSession.mockResolvedValue({
    ok: true,
    participant: { participantId: PARTICIPANT, secret: SECRET },
  });
  checkParticipant.mockResolvedValue({ ok: false, reason: "unknown" });
  verifiedAccountId.mockResolvedValue(null);
});

describe("joinLiveSession", () => {
  it("resolves the code, creates the participant and lands on that session", async () => {
    expect(await joinAndFollow(form("7kq 2mz", "  Sam  Okafor "))).toBe(`/play/${SESSION}`);

    // Normalized before it is spent, and against the service-role client, which is the only role
    // `resolve_session_code` is granted to.
    expect(resolveSessionCode).toHaveBeenCalledWith(SERVICE_CLIENT, "7KQ2MZ", "203.0.113.42");
    // The session id is the one the lookup returned, never anything the browser sent.
    expect(joinSession).toHaveBeenCalledWith(SERVICE_CLIENT, SESSION, "Sam Okafor", null);
  });

  it("writes the token the database issued, in an httpOnly cookie", async () => {
    await joinAndFollow(form("7KQ2MZ", "Sam"));

    const cookie = jar.get(PARTICIPANT_COOKIE);
    expect(cookie?.value).toBe(`${SESSION}.${PARTICIPANT}.${SECRET}`);
    // Every attribute, not a subset: `secure` and `maxAge` are the two a regression could drop
    // without any other test noticing, and dropping either is a security change.
    expect(cookie?.options).toEqual(
      participantCookieOptions(process.env.NODE_ENV === "production"),
    );
    expect(cookie?.options.maxAge).toBe(PARTICIPANT_COOKIE_MAX_AGE_SECONDS);
  });

  it("refuses a code that could not name a session without spending a lookup", async () => {
    expect(await joinLiveSession({ status: "idle" }, form("nope", "Sam"))).toEqual({
      status: "error",
      field: "code",
      error: JOIN_CODE_ERROR,
    });
    expect(resolveSessionCode).not.toHaveBeenCalled();
    expect(joinSession).not.toHaveBeenCalled();
  });

  it("says the same thing about a code that never was and one whose session has ended", async () => {
    resolveSessionCode.mockResolvedValue({ status: "unknown" });
    const refused = await joinLiveSession({ status: "idle" }, form("7KQ2MZ", "Sam"));
    expect(refused).toEqual({
      status: "error",
      field: "code",
      error: "That join code does not match an open live session. Check it and try again.",
    });
    expect(joinSession).not.toHaveBeenCalled();
  });

  it("passes the per-address limit's refusal on, and never joins past it", async () => {
    resolveSessionCode.mockResolvedValue({ status: "rate_limited" });
    expect(await joinLiveSession({ status: "idle" }, form("7KQ2MZ", "Sam"))).toEqual({
      status: "error",
      field: "code",
      error: "Too many join attempts from this network. Wait a few minutes, then try again.",
    });
    expect(joinSession).not.toHaveBeenCalled();
  });

  it("fails closed when the lookup cannot be made at all", async () => {
    resolveSessionCode.mockResolvedValue({ status: "unavailable" });
    expect(await joinLiveSession({ status: "idle" }, form("7KQ2MZ", "Sam"))).toEqual({
      status: "error",
      error: "Joining is not working just now. Try again in a moment.",
    });
    expect(joinSession).not.toHaveBeenCalled();
  });

  it("comes back as the same participant when this browser is already in this room", async () => {
    jar.set(PARTICIPANT_COOKIE, {
      value: `${SESSION}.${PARTICIPANT}.${SECRET}`,
      options: {},
    });
    checkParticipant.mockResolvedValue({
      ok: true,
      participant: {
        participantId: PARTICIPANT,
        displayName: "Sam Okafor",
        sessionStatus: "lobby",
        mode: "instructor_paced",
        title: "Cardiac bank",
      },
    });

    expect(await joinAndFollow(form("7KQ2MZ", "Someone Else"))).toBe(`/play/${SESSION}`);
    expect(joinSession).not.toHaveBeenCalled();
    // The same token, written again: its twelve hours run from the last time the join page was
    // used, so a long afternoon does not expire it under someone still in the room.
    expect(jar.get(PARTICIPANT_COOKIE)).toEqual({
      value: `${SESSION}.${PARTICIPANT}.${SECRET}`,
      options: expect.objectContaining({ httpOnly: true, maxAge: expect.any(Number) }),
    });
    // And the name they typed the second time does not quietly rename them.
    expect(checkParticipant).toHaveBeenCalledWith(SERVICE_CLIENT, {
      sessionId: SESSION,
      participantId: PARTICIPANT,
      secret: SECRET,
    });
  });

  it("joins afresh when the token names a different session, and replaces the cookie", async () => {
    jar.set(PARTICIPANT_COOKIE, {
      value: `${OTHER_SESSION}.${PARTICIPANT}.${SECRET}`,
      options: {},
    });

    await joinAndFollow(form("7KQ2MZ", "Sam"));
    expect(checkParticipant).not.toHaveBeenCalled();
    expect(joinSession).toHaveBeenCalledTimes(1);
    expect(jar.get(PARTICIPANT_COOKIE)?.value).toBe(`${SESSION}.${PARTICIPANT}.${SECRET}`);
  });

  it("joins afresh when the cookie is rubbish, rather than trusting its shape", async () => {
    jar.set(PARTICIPANT_COOKIE, { value: "not-a-token", options: {} });
    await joinAndFollow(form("7KQ2MZ", "Sam"));
    expect(checkParticipant).not.toHaveBeenCalled();
    expect(joinSession).toHaveBeenCalledTimes(1);
  });

  it("joins afresh when a token for this session is no longer good", async () => {
    jar.set(PARTICIPANT_COOKIE, { value: `${SESSION}.${PARTICIPANT}.${SECRET}`, options: {} });
    checkParticipant.mockResolvedValue({ ok: false, reason: "unknown" });

    await joinAndFollow(form("7KQ2MZ", "Sam"));
    expect(checkParticipant).toHaveBeenCalledTimes(1);
    expect(joinSession).toHaveBeenCalledTimes(1);
  });

  it("does not join a second time when the database could not say who this browser is", async () => {
    jar.set(PARTICIPANT_COOKIE, { value: `${SESSION}.${PARTICIPANT}.${SECRET}`, options: {} });
    checkParticipant.mockResolvedValue({ ok: false, reason: "unavailable" });

    expect(await joinLiveSession({ status: "idle" }, form("7KQ2MZ", "Sam"))).toEqual({
      status: "error",
      error: "Joining is not working just now. Try again in a moment.",
    });
    // One student, one name in the room: their first participant and its answers stay theirs.
    expect(joinSession).not.toHaveBeenCalled();
    // And the cookie that names them is left as it was.
    expect(jar.get(PARTICIPANT_COOKIE)?.value).toBe(`${SESSION}.${PARTICIPANT}.${SECRET}`);
  });

  it("says so when the room is full", async () => {
    joinSession.mockResolvedValue({ ok: false, reason: "full" });
    expect(await joinLiveSession({ status: "idle" }, form("7KQ2MZ", "Sam"))).toEqual({
      status: "error",
      error: "That live session is full.",
    });
    expect(jar.has(PARTICIPANT_COOKIE)).toBe(false);
  });

  it("tells someone whose session closed mid-join what everyone else typing that code is told", async () => {
    for (const reason of ["gone", "ended"] as const) {
      joinSession.mockResolvedValue({ ok: false, reason });
      expect(await joinLiveSession({ status: "idle" }, form("7KQ2MZ", "Sam"))).toEqual({
        status: "error",
        field: "code",
        error: "That join code does not match an open live session. Check it and try again.",
      });
    }
  });

  it("writes no cookie and sends nobody anywhere when the join itself breaks", async () => {
    joinSession.mockResolvedValue({ ok: false, reason: "failed" });
    expect(await joinLiveSession({ status: "idle" }, form("7KQ2MZ", "Sam"))).toEqual({
      status: "error",
      error: "Joining is not working just now. Try again in a moment.",
    });
    expect(jar.has(PARTICIPANT_COOKIE)).toBe(false);
    expect(redirected).not.toHaveBeenCalled();
  });

  it("refuses a name the form would not have allowed, and never reaches the database", async () => {
    expect(await joinLiveSession({ status: "idle" }, form("7KQ2MZ", "   "))).toMatchObject({
      status: "error",
      field: "displayName",
    });
    expect(resolveSessionCode).not.toHaveBeenCalled();
  });
});

describe("joinLiveSession for a class session (ADR 0013)", () => {
  it("passes a signed-in member's verified account, for the database to link", async () => {
    verifiedAccountId.mockResolvedValue(MEMBER);
    expect(await joinAndFollow(form("7KQ2MZ", "Mia Chen"))).toBe(`/play/${SESSION}`);
    expect(joinSession).toHaveBeenCalledWith(SERVICE_CLIENT, SESSION, "Mia Chen", MEMBER);
    expect(jar.get(PARTICIPANT_COOKIE)?.value).toBe(`${SESSION}.${PARTICIPANT}.${SECRET}`);
  });

  it("passes a signed-in non-member's account the same way: membership is the database's check", async () => {
    // join_session links only a current member of the session's class and joins anyone else
    // anonymously, so the action claims nothing about membership and asks for nothing more.
    verifiedAccountId.mockResolvedValue(SOMEONE_ELSE);
    expect(await joinAndFollow(form("7KQ2MZ", "Noor"))).toBe(`/play/${SESSION}`);
    expect(joinSession).toHaveBeenCalledWith(SERVICE_CLIENT, SESSION, "Noor", SOMEONE_ELSE);
  });

  it("joins a signed-out person as a guest, exactly as before", async () => {
    verifiedAccountId.mockResolvedValue(null);
    await joinAndFollow(form("7KQ2MZ", "Sam"));
    expect(joinSession).toHaveBeenCalledWith(SERVICE_CLIENT, SESSION, "Sam", null);
  });

  it("never takes an account from the form, whatever a browser posts", async () => {
    const forged = form("7KQ2MZ", "Sam");
    for (const name of ["profileId", "profile_id", "joining_profile", "memberId", "userId"]) {
      forged.set(name, MEMBER);
    }

    // Signed out: still a guest.
    verifiedAccountId.mockResolvedValue(null);
    await joinAndFollow(forged);
    expect(joinSession).toHaveBeenLastCalledWith(SERVICE_CLIENT, SESSION, "Sam", null);

    // Signed in as someone else: that someone, never the posted id.
    verifiedAccountId.mockResolvedValue(SOMEONE_ELSE);
    await joinAndFollow(forged);
    expect(joinSession).toHaveBeenLastCalledWith(SERVICE_CLIENT, SESSION, "Sam", SOMEONE_ELSE);
  });

  it("joins a signed-in person who chose to be a guest as a guest, without reading their account", async () => {
    verifiedAccountId.mockResolvedValue(MEMBER);
    const asGuest = form("7KQ2MZ", "Sam");
    asGuest.set("guest", "1");
    await joinAndFollow(asGuest);
    expect(joinSession).toHaveBeenCalledWith(SERVICE_CLIENT, SESSION, "Sam", null);
    expect(verifiedAccountId).not.toHaveBeenCalled();
  });

  it("reads no account for a code that does not resolve", async () => {
    resolveSessionCode.mockResolvedValue({ status: "unknown" });
    await joinLiveSession({ status: "idle" }, form("7KQ2MZ", "Sam"));
    expect(verifiedAccountId).not.toHaveBeenCalled();
  });

  it("comes back as the participant this browser already is, without reading the account", async () => {
    jar.set(PARTICIPANT_COOKIE, { value: `${SESSION}.${PARTICIPANT}.${SECRET}`, options: {} });
    checkParticipant.mockResolvedValue({
      ok: true,
      participant: {
        participantId: PARTICIPANT,
        displayName: "Mia Chen",
        joinedAt: 0,
        sessionStatus: "lobby",
        mode: "instructor_paced",
        title: "Cardiac bank",
      },
    });
    verifiedAccountId.mockResolvedValue(MEMBER);
    expect(await joinAndFollow(form("7KQ2MZ", "Mia Chen"))).toBe(`/play/${SESSION}`);
    expect(joinSession).not.toHaveBeenCalled();
    expect(verifiedAccountId).not.toHaveBeenCalled();
  });
});
