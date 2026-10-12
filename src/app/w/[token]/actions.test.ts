import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";
import {
  INVITE_ACCEPT_LIMIT,
  INVITE_ACCEPT_RATE_LIMITED,
  INVITE_ACCEPT_UNAVAILABLE,
} from "@/lib/workspace/acceptLimit";
import { INVITE_UNAVAILABLE, ORG_INVITE_LIFETIME_MS } from "@/lib/workspace/invite";
import {
  MOVE_CONFIRM_FIELD,
  MOVE_LEAVING_FIELD,
  MOVE_NOT_CONFIRMED,
} from "@/lib/workspace/membership";

/**
 * The invitation page's Server Functions are wiring. What is pinned here is the wiring the
 * security review asked for: who the database is told is accepting, which client asks it, what is
 * counted and with which address, that nothing but `accepted` changes an account, and that the
 * token appears in no answer and no log.
 */

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const USER = "00000000-0000-4000-8000-0000000000a1";
const OTHER_USER = "00000000-0000-4000-8000-0000000000b2";
const NEW_USER = "00000000-0000-4000-8000-0000000000c3";
const INVITED = "grace@school.edu";
const EXPIRES = "2026-10-16T12:00:00.000Z";
const ISSUED = Date.parse(EXPIRES) - ORG_INVITE_LIFETIME_MS;
const CHOOSE_PASSWORD = "/account/password?next=%2Fauthor&confirmed=1";

const requestHeaders = new Headers({
  "x-vercel-id": "iad1::test",
  "x-vercel-forwarded-for": "203.0.113.1",
  // What a caller can send on its own. It must never become the key anything is counted on.
  "x-forwarded-for": "198.51.100.66",
  origin: "https://learn.example",
});
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

type Reply = { data: unknown; error: { code?: string; message?: string } | null };
const PENDING = {
  state: "pending",
  workspace_name: "Ada’s workspace",
  inviter_name: "Ada Lovelace",
  inviter_email: "ada@school.edu",
  invited_email: INVITED,
  expires_at: EXPIRES,
};
let resolveReply: Reply;
let acceptReply: Reply;
const serviceRpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<Reply>>(
  async (name) => (name === "resolve_org_invite" ? resolveReply : acceptReply),
);
type Created = {
  data?: { user: { id: string } | null };
  error: { code?: string; status?: number } | null;
};
const createUser = vi.fn<(params: Record<string, unknown>) => Promise<Created>>(async () => ({
  data: { user: { id: NEW_USER } },
  error: null,
}));
const updateUserById = vi.fn<
  (id: string, attributes: Record<string, unknown>) => Promise<{ error: null }>
>(async () => ({
  error: null,
}));
const profileEq = vi.fn<(column: string, value: string) => Promise<{ error: null }>>(async () => ({
  error: null,
}));
const profileUpdate = vi.fn<(values: Record<string, unknown>) => { eq: typeof profileEq }>(() => ({
  eq: profileEq,
}));
const serviceFrom = vi.fn<(table: string) => { update: typeof profileUpdate }>(() => ({
  update: profileUpdate,
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    rpc: serviceRpc,
    from: serviceFrom,
    auth: { admin: { createUser, updateUserById } },
  }),
}));

type SessionUser = { id: string; email: string; app_metadata: Record<string, unknown> } | null;
let sessionUser: SessionUser;
let sessionClaims: Record<string, unknown> | null;
const getUser = vi.fn(async () =>
  sessionUser
    ? { data: { user: sessionUser }, error: null }
    : { data: { user: null }, error: { status: 401 } },
);
const getClaims = vi.fn(async () => ({ data: sessionClaims ? { claims: sessionClaims } : null }));
const refreshSession = vi.fn(async () => ({ error: null }));
const updateUser = vi.fn<(attributes: { password: string }) => Promise<{ error: null }>>(
  async () => ({ error: null }),
);
const signOut = vi.fn<(options: { scope: string }) => Promise<{ error: null }>>(async () => ({
  error: null,
}));
const signInWithPassword = vi.fn<
  (credentials: {
    email: string;
    password: string;
  }) => Promise<{ error: { status?: number } | null }>
>(async () => ({ error: null }));
// The cookie client must never be the one that asks the database about an invitation.
const cookieRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: cookieRpc,
    auth: { getUser, getClaims, refreshSession, updateUser, signOut, signInWithPassword },
  }),
}));

vi.mock("@/lib/rateLimit/postgresStore", async () => {
  const { createMemoryRateLimitStore } = await import("@/lib/rateLimit/testing/memoryStore");
  const store = createMemoryRateLimitStore();
  return { sharedRateLimitStore: () => store };
});
const rateLimitStore = (
  await import("@/lib/rateLimit/postgresStore")
).sharedRateLimitStore() as MemoryRateLimitStore;

const { acceptInvitation, createAccountAndAccept, moveToInvitedWorkspace, signOutToInvitation } =
  await import("./actions");

const logs = [
  vi.spyOn(console, "error").mockImplementation(() => {}),
  vi.spyOn(console, "warn").mockImplementation(() => {}),
  vi.spyOn(console, "log").mockImplementation(() => {}),
  vi.spyOn(console, "info").mockImplementation(() => {}),
];
const logged = () => JSON.stringify(logs.flatMap((spy) => spy.mock.calls));

const sessionAt = (ms: number) => [{ method: "password", timestamp: ms / 1000 }];

/** Signed in as the invited address, a day before the invitation existed, address confirmed. */
function signInAs(
  over: { id?: string; unconfirmed?: boolean; startedAt?: number; claimsSub?: string } = {},
) {
  const id = over.id ?? USER;
  sessionUser = {
    id,
    email: INVITED,
    app_metadata: over.unconfirmed ? { learn_email_unconfirmed: true } : {},
  };
  sessionClaims = {
    sub: over.claimsSub ?? id,
    amr: sessionAt(over.startedAt ?? ISSUED - 86_400_000),
  };
}

function nothingChanged() {
  expect(updateUserById).not.toHaveBeenCalled();
  expect(refreshSession).not.toHaveBeenCalled();
  expect(updateUser).not.toHaveBeenCalled();
  expect(signOut).not.toHaveBeenCalled();
}

function accountForm(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("displayName", "Grace Hopper");
  form.set("password", "correct horse battery staple");
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

let caller = 1;

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitStore.failWith(null);
  caller += 1;
  requestHeaders.set("x-vercel-forwarded-for", `203.0.113.${caller}`);
  resolveReply = { data: [PENDING], error: null };
  acceptReply = { data: "accepted", error: null };
  signInAs();
});

// React hands the form state and data over after the bound token; the action reads neither.
const join = (form: FormData = new FormData()) =>
  (
    acceptInvitation as (
      token: string,
      state: unknown,
      form: FormData,
    ) => ReturnType<typeof acceptInvitation>
  )(TOKEN, { status: "idle" }, form);
const create = (form: FormData = accountForm()) =>
  createAccountAndAccept(TOKEN, { status: "idle" }, form);
const LEAVING = "00000000-0000-4000-8000-0000000000d4";
function moveForm(ticked: boolean | string, leaving: string | null = LEAVING): FormData {
  const form = new FormData();
  if (ticked === true) form.set(MOVE_CONFIRM_FIELD, "on");
  else if (typeof ticked === "string") form.set(MOVE_CONFIRM_FIELD, ticked);
  if (leaving !== null) form.set(MOVE_LEAVING_FIELD, leaving);
  return form;
}
const move = (form: FormData = moveForm(true)) =>
  moveToInvitedWorkspace(TOKEN, { status: "idle" }, form);
const acceptCalls = () => serviceRpc.mock.calls.filter(([name]) => name === "accept_org_invite");

describe("acceptInvitation", () => {
  it("accepts for the account Supabase Auth says is signed in, with the service role", async () => {
    await expect(join()).rejects.toThrow("redirect:/author");
    expect(getUser).toHaveBeenCalledOnce();
    expect(serviceRpc).toHaveBeenCalledWith("accept_org_invite", { p_user: USER, token: TOKEN });
    expect(cookieRpc).not.toHaveBeenCalled();
  });

  it("never takes the account from the request", async () => {
    const form = new FormData();
    for (const name of ["p_user", "userId", "user_id", "id"]) form.set(name, OTHER_USER);
    await expect(join(form)).rejects.toThrow("redirect:/author");
    expect(JSON.stringify(serviceRpc.mock.calls)).not.toContain(OTHER_USER);
  });

  it("resolves the token first, counted on the platform's address for the caller", async () => {
    await expect(join()).rejects.toThrow("redirect:");
    expect(serviceRpc.mock.calls.map(([name]) => name)).toEqual([
      "resolve_org_invite",
      "accept_org_invite",
    ]);
    expect(serviceRpc).toHaveBeenCalledWith("resolve_org_invite", {
      token: TOKEN,
      client_key: `203.0.113.${caller}`,
    });
    expect(JSON.stringify(serviceRpc.mock.calls)).not.toContain("198.51.100.66");
    expect(rateLimitStore.hits().every((hit) => hit.key !== "198.51.100.66")).toBe(true);
  });

  it("sends a visitor back to the page, having asked the database nothing", async () => {
    sessionUser = null;
    await expect(join()).rejects.toThrow(`redirect:/w/${TOKEN}`);
    expect(serviceRpc).not.toHaveBeenCalled();
    nothingChanged();
  });

  it("answers an unknown token and a refused lookup identically, and accepts neither", async () => {
    resolveReply = { data: [], error: null };
    const unknown = await join();
    resolveReply = { data: null, error: { code: "PT429" } };
    const limited = await join();
    expect(unknown).toEqual({ status: "invalid" });
    expect(limited).toEqual(unknown);
    expect(serviceRpc).not.toHaveBeenCalledWith("accept_org_invite", expect.anything());
    nothingChanged();
  });

  it.each(["expired", "revoked", "accepted"] as const)(
    "says an invitation is %s without trying to accept it",
    async (state) => {
      resolveReply = { data: [{ ...PENDING, state }], error: null };
      expect(await join()).toEqual({ status: "closed", state });
      expect(serviceRpc).toHaveBeenCalledTimes(1);
      nothingChanged();
    },
  );

  it("says so when the database cannot answer", async () => {
    resolveReply = { data: null, error: { code: "08006" } };
    expect(await join()).toEqual({ status: "error", error: INVITE_UNAVAILABLE });
    nothingChanged();
  });

  it.each([
    ["student", { status: "refused", reason: "student" }],
    ["already_teaches", { status: "refused", reason: "already_teaches" }],
    ["already_member", { status: "refused", reason: "already_member" }],
    ["admin_account", { status: "refused", reason: "admin_account" }],
    ["teaches_shared", { status: "refused", reason: "teaches_shared" }],
    ["founder_with_members", { status: "refused", reason: "founder_with_members" }],
    ["students_depend", { status: "refused", reason: "students_depend" }],
    ["move_needs_confirmation", { status: "error", error: MOVE_NOT_CONFIRMED }],
    ["wrong_address", { status: "refused", reason: "wrong_address" }],
    ["shared_workspace", { status: "refused", reason: "shared_workspace" }],
    ["members_full", { status: "refused", reason: "members_full" }],
    ["already_accepted", { status: "closed", state: "accepted" }],
    ["revoked", { status: "closed", state: "revoked" }],
    ["expired", { status: "closed", state: "expired" }],
    ["invalid", { status: "invalid" }],
  ])(
    "on %s: says so, and leaves the account, its password and its sessions alone",
    async (answer, shown) => {
      // The account most at risk: unconfirmed, in a session made for this visit.
      signInAs({ unconfirmed: true, startedAt: ISSUED + 60_000 });
      acceptReply = { data: answer, error: null };
      expect(await join()).toEqual(shown);
      expect(redirected).not.toHaveBeenCalled();
      nothingChanged();
    },
  );

  describe("once accepted", () => {
    it("refreshes the session and goes to authoring, for an account signed in all along", async () => {
      await expect(join()).rejects.toThrow("redirect:/author");
      expect(refreshSession).toHaveBeenCalledOnce();
      // Confirmed already, and this browser was the account's before the invitation existed.
      expect(updateUserById).not.toHaveBeenCalled();
      expect(updateUser).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });

    it("marks an unconfirmed address confirmed, then ends whatever access it had before", async () => {
      signInAs({ unconfirmed: true });
      await expect(join()).rejects.toThrow(`redirect:${CHOOSE_PASSWORD}`);
      expect(updateUserById).toHaveBeenCalledWith(USER, {
        app_metadata: { learn_email_unconfirmed: null },
      });
      expect(refreshSession).toHaveBeenCalledOnce();
      // #378's mechanism: the session changes its own password, never the admin API.
      expect(updateUser).toHaveBeenCalledOnce();
      const password = updateUser.mock.calls[0]![0].password;
      expect(password.length).toBeGreaterThanOrEqual(40);
      expect(signOut).toHaveBeenCalledWith({ scope: "others" });
      expect(JSON.stringify(updateUserById.mock.calls)).not.toContain("password");
      // In #378's order: confirmed, refreshed, password replaced, others signed out.
      const order = [updateUserById, refreshSession, updateUser, signOut].map(
        (call) => call.mock.invocationCallOrder[0]!,
      );
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(logged()).not.toContain(password);
    });

    it("ends earlier access for a confirmed account that signed in after the link went out", async () => {
      signInAs({ startedAt: ISSUED + 60_000 });
      await expect(join()).rejects.toThrow(`redirect:${CHOOSE_PASSWORD}`);
      expect(updateUserById).not.toHaveBeenCalled();
      expect(updateUser).toHaveBeenCalledOnce();
      expect(signOut).toHaveBeenCalledWith({ scope: "others" });
    });

    it("ends earlier access when the token read is not this account's, or says nothing", async () => {
      signInAs({ claimsSub: OTHER_USER });
      await expect(join()).rejects.toThrow(`redirect:${CHOOSE_PASSWORD}`);
      expect(updateUser).toHaveBeenCalledOnce();

      vi.clearAllMocks();
      signInAs();
      sessionClaims = null;
      await expect(join()).rejects.toThrow(`redirect:${CHOOSE_PASSWORD}`);
      expect(updateUser).toHaveBeenCalledOnce();
    });
  });

  it("is counted per caller, and a refused caller reaches nothing", async () => {
    for (let i = 0; i < INVITE_ACCEPT_LIMIT.attempts; i += 1) {
      acceptReply = { data: "members_full", error: null };
      await join();
    }
    vi.clearAllMocks();
    expect(await join()).toEqual({ status: "error", error: INVITE_ACCEPT_RATE_LIMITED });
    expect(getUser).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(rateLimitStore.hits().at(-1)).toEqual({
      bucket: "workspace_invite_accept",
      key: `203.0.113.${caller}`,
    });
  });

  it("refuses rather than accept uncounted when the limiter cannot answer", async () => {
    rateLimitStore.failWith(new RateLimitUnavailableError("08006"));
    expect(await join()).toEqual({ status: "error", error: INVITE_ACCEPT_UNAVAILABLE });
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("puts the token in no answer and no log", async () => {
    const answers: unknown[] = [];
    resolveReply = { data: null, error: { code: "08006", message: `bad ${TOKEN}` } };
    answers.push(await join());
    resolveReply = { data: [PENDING], error: null };
    acceptReply = { data: null, error: { code: "P0002", message: `bad ${TOKEN}` } };
    answers.push(await join());
    acceptReply = { data: "student", error: null };
    answers.push(await join());
    expect(JSON.stringify(answers)).not.toContain(TOKEN);
    expect(logged()).not.toContain(TOKEN);
    expect(logged()).not.toContain(INVITED);
  });
});

describe("acceptInvitation never confirms a move", () => {
  it("sends no confirmation, whatever the form posts", async () => {
    await expect(join(moveForm(true))).rejects.toThrow("redirect:/author");
    expect(acceptCalls()).toEqual([["accept_org_invite", { p_user: USER, token: TOKEN }]]);
  });
});

describe("moveToInvitedWorkspace", () => {
  it("accepts with the confirmation when the box was ticked, for the signed-in account", async () => {
    await expect(move()).rejects.toThrow("redirect:/author");
    expect(getUser).toHaveBeenCalledOnce();
    expect(acceptCalls()).toEqual([
      [
        "accept_org_invite",
        { p_user: USER, token: TOKEN, p_confirm_move: true, p_leaving: LEAVING },
      ],
    ]);
    expect(cookieRpc).not.toHaveBeenCalled();
  });

  it.each([
    ["no box at all", moveForm(false)],
    ["an empty value", moveForm("")],
    ["a value that is not a ticked box", moveForm("true")],
    ["a ticked box and no workspace named", moveForm(true, null)],
    ["a ticked box and a workspace id that is not one", moveForm(true, "mine")],
  ])("sends no confirmation with %s, and says what the database answers", async (_why, form) => {
    acceptReply = { data: "move_needs_confirmation", error: null };
    expect(await move(form)).toEqual({ status: "error", error: MOVE_NOT_CONFIRMED });
    expect(acceptCalls()).toEqual([["accept_org_invite", { p_user: USER, token: TOKEN }]]);
    expect(redirected).not.toHaveBeenCalled();
    nothingChanged();
  });

  it("passes on the workspace the form names and lets the database judge it", async () => {
    // Somebody else's workspace, or one the account has since left: the database answers.
    acceptReply = { data: "move_needs_confirmation", error: null };
    expect(await move(moveForm(true, OTHER_USER))).toEqual({
      status: "error",
      error: MOVE_NOT_CONFIRMED,
    });
    expect(acceptCalls()).toEqual([
      [
        "accept_org_invite",
        { p_user: USER, token: TOKEN, p_confirm_move: true, p_leaving: OTHER_USER },
      ],
    ]);
    nothingChanged();
  });

  it("signs out the account's other sessions on a move, and leaves the password alone", async () => {
    // Confirmed, and signed in here before the invitation existed: nothing else is ended.
    await expect(move()).rejects.toThrow("redirect:/author");
    expect(signOut).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(updateUser).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("signs nobody out when the database did not move the account", async () => {
    acceptReply = { data: "students_depend", error: null };
    await move();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("logs a move once, with ids only", async () => {
    await expect(move()).rejects.toThrow("redirect:/author");
    const info = logs[3]!.mock.calls;
    expect(info).toEqual([
      ["[workspace] teacher_moved", { actor: USER, target: USER, org: LEAVING }],
    ]);
    expect(JSON.stringify(info)).not.toContain(INVITED);
  });

  it("logs nothing for a first acceptance or a move that was refused", async () => {
    await expect(join()).rejects.toThrow("redirect:/author");
    acceptReply = { data: "founder_with_members", error: null };
    await move();
    expect(logs[3]!.mock.calls).toEqual([]);
  });

  it("never takes the account from the request", async () => {
    const form = moveForm(true);
    form.set("userId", OTHER_USER);
    form.set("p_user", OTHER_USER);
    await expect(move(form)).rejects.toThrow("redirect:/author");
    expect(JSON.stringify(serviceRpc.mock.calls)).not.toContain(OTHER_USER);
  });

  it("resolves the token first, counted on the platform's address, and accepts nothing closed", async () => {
    resolveReply = { data: [{ ...PENDING, state: "revoked" }], error: null };
    expect(await move()).toEqual({ status: "closed", state: "revoked" });
    expect(serviceRpc.mock.calls[0]![0]).toBe("resolve_org_invite");
    expect(serviceRpc.mock.calls[0]![1]).toMatchObject({
      client_key: requestHeaders.get("x-vercel-forwarded-for"),
    });
    expect(acceptCalls()).toEqual([]);
    nothingChanged();
  });

  it("sends a visitor back to the page, having asked the database nothing", async () => {
    sessionUser = null;
    await expect(move()).rejects.toThrow(`redirect:/w/${TOKEN}`);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it.each(["founder_with_members", "students_depend", "teaches_shared", "members_full"] as const)(
    "on %s: says so and changes nothing, even confirmed",
    async (reason) => {
      signInAs({ unconfirmed: true, startedAt: ISSUED + 60_000 });
      acceptReply = { data: reason, error: null };
      expect(await move()).toEqual({ status: "refused", reason });
      nothingChanged();
    },
  );

  it("retires an earlier password on a move exactly as on a first acceptance", async () => {
    signInAs({ unconfirmed: true });
    await expect(move()).rejects.toThrow(`redirect:${CHOOSE_PASSWORD}`);
    expect(updateUserById).toHaveBeenCalledWith(USER, {
      app_metadata: { learn_email_unconfirmed: null },
    });
    expect(updateUser).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("retires it too for a confirmed account whose session is newer than the invitation", async () => {
    signInAs({ startedAt: ISSUED + 60_000 });
    await expect(move()).rejects.toThrow(`redirect:${CHOOSE_PASSWORD}`);
    expect(updateUser).toHaveBeenCalledOnce();
  });

  it("falls back to the two-argument function on a database without the migration", async () => {
    serviceRpc.mockImplementation(async (name, args) => {
      if (name === "resolve_org_invite") return resolveReply;
      return "p_confirm_move" in args
        ? { data: null, error: { code: "PGRST202" } }
        : { data: "already_teaches", error: null };
    });
    try {
      expect(await move()).toEqual({ status: "refused", reason: "already_teaches" });
      expect(acceptCalls().map(([, args]) => args)).toEqual([
        { p_user: USER, token: TOKEN, p_confirm_move: true, p_leaving: LEAVING },
        { p_user: USER, token: TOKEN },
      ]);
      nothingChanged();
    } finally {
      serviceRpc.mockImplementation(async (name) =>
        name === "resolve_org_invite" ? resolveReply : acceptReply,
      );
    }
  });

  it("is counted per caller, on the same budget as accepting", async () => {
    acceptReply = { data: "move_needs_confirmation", error: null };
    for (let attempt = 0; attempt < INVITE_ACCEPT_LIMIT.attempts; attempt += 1)
      await move(moveForm(false));
    serviceRpc.mockClear();
    expect(await move()).toEqual({ status: "error", error: INVITE_ACCEPT_RATE_LIMITED });
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("puts the token in no answer and no log", async () => {
    acceptReply = { data: "students_depend", error: null };
    const answer = await move();
    expect(JSON.stringify(answer)).not.toContain(TOKEN);
    expect(logged()).not.toContain(TOKEN);
  });
});

describe("createAccountAndAccept", () => {
  beforeEach(() => {
    sessionUser = null;
    sessionClaims = null;
  });

  it("makes the account on the invited address, accepts for it and signs in", async () => {
    await expect(create()).rejects.toThrow("redirect:/author");
    expect(createUser).toHaveBeenCalledWith({
      email: INVITED,
      password: "correct horse battery staple",
      email_confirm: true,
    });
    expect(profileUpdate).toHaveBeenCalledWith({ display_name: "Grace Hopper" });
    expect(profileEq).toHaveBeenCalledWith("id", NEW_USER);
    // The id `createUser` returned, on the service role.
    expect(serviceRpc).toHaveBeenCalledWith("accept_org_invite", {
      p_user: NEW_USER,
      token: TOKEN,
    });
    expect(cookieRpc).not.toHaveBeenCalled();
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: INVITED,
      password: "correct horse battery staple",
    });
  });

  it("ignores any address or account the form posts", async () => {
    const form = accountForm({ email: "mallory@evil.example", p_user: OTHER_USER, id: OTHER_USER });
    await expect(create(form)).rejects.toThrow("redirect:/author");
    expect(createUser.mock.calls[0]![0]).toMatchObject({ email: INVITED });
    const sent = JSON.stringify([createUser.mock.calls, serviceRpc.mock.calls]);
    expect(sent).not.toContain("mallory@evil.example");
    expect(sent).not.toContain(OTHER_USER);
  });

  it("makes the account without the unconfirmed key, and ends nobody's access", async () => {
    await expect(create()).rejects.toThrow("redirect:/author");
    expect(JSON.stringify(createUser.mock.calls)).not.toContain("learn_email_unconfirmed");
    expect(updateUserById).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("checks the form before anything is counted or asked", async () => {
    expect(await create(accountForm({ displayName: "  " }))).toMatchObject({
      status: "error",
      field: "displayName",
    });
    expect(await create(accountForm({ password: "short" }))).toMatchObject({
      status: "error",
      field: "password",
    });
    expect(rateLimitStore.hits().filter((hit) => hit.key === `203.0.113.${caller}`)).toEqual([]);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("makes nothing for a token that is not a pending invitation", async () => {
    resolveReply = { data: [], error: null };
    const unknown = await create();
    resolveReply = { data: null, error: { code: "PT429" } };
    const limited = await create();
    expect(unknown).toEqual({ status: "invalid" });
    expect(limited).toEqual(unknown);
    for (const state of ["expired", "revoked", "accepted"] as const) {
      resolveReply = { data: [{ ...PENDING, state }], error: null };
      expect(await create()).toEqual({ status: "closed", state });
    }
    resolveReply = { data: null, error: { code: "08006" } };
    expect(await create()).toEqual({ status: "error", error: INVITE_UNAVAILABLE, field: null });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("only says so when the address has an account: nothing is accepted or signed in", async () => {
    createUser.mockResolvedValueOnce({ error: { code: "email_exists", status: 422 } });
    expect(await create()).toEqual({ status: "exists" });
    expect(serviceRpc).not.toHaveBeenCalledWith("accept_org_invite", expect.anything());
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("sends someone already signed in back to the page, and makes nothing", async () => {
    signInAs();
    await expect(create()).rejects.toThrow(`redirect:/w/${TOKEN}`);
    expect(createUser).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("says what the database answered when the invitation closed meanwhile", async () => {
    acceptReply = { data: "members_full", error: null };
    expect(await create()).toEqual({ status: "refused", reason: "members_full" });
    expect(redirected).not.toHaveBeenCalled();
  });

  it("says the account is ready when this browser could not be signed in", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { status: 500 } });
    expect(await create()).toEqual({ status: "created_signed_out" });
  });

  it("is counted per caller, on the same budget as accepting", async () => {
    createUser.mockResolvedValue({ error: { code: "email_exists", status: 422 } });
    for (let i = 0; i < INVITE_ACCEPT_LIMIT.attempts; i += 1) await create();
    vi.clearAllMocks();
    expect(await create()).toEqual({
      status: "error",
      error: INVITE_ACCEPT_RATE_LIMITED,
      field: null,
    });
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
    createUser.mockReset();
    createUser.mockImplementation(async () => ({ data: { user: { id: NEW_USER } }, error: null }));
  });

  it("puts the token, the address and the password in no answer and no log", async () => {
    const answers: unknown[] = [];
    createUser.mockResolvedValueOnce({ error: { code: "unexpected_failure", status: 500 } });
    answers.push(await create());
    acceptReply = { data: null, error: { code: "P0002", message: `bad ${TOKEN}` } };
    answers.push(await create());
    const said = `${JSON.stringify(answers)} ${logged()}`;
    for (const secret of [TOKEN, INVITED, "correct horse battery staple"]) {
      expect(said).not.toContain(secret);
    }
  });
});

describe("signOutToInvitation", () => {
  it("signs this browser out and comes back to the invitation", async () => {
    await expect(signOutToInvitation(TOKEN)).rejects.toThrow(`redirect:/w/${TOKEN}`);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
