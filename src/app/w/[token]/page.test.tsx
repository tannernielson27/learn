import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INVITE_CLOSED,
  INVITE_NOT_VALID_HEADING,
  INVITE_REFUSED,
  INVITE_UNAVAILABLE,
} from "@/lib/workspace/invite";

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const INVITED = "grace.hopper@school.edu";

type Reply = { data: unknown; error: { code?: string } | null };

const mocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn(async () => ({ status: "idle" as const })),
  createAccountAndAccept: vi.fn(async () => ({ status: "idle" as const })),
  moveToInvitedWorkspace: vi.fn(async () => ({ status: "idle" as const })),
  signOutToInvitation: vi.fn(async () => undefined),
  rpc: vi.fn(),
  admin: {
    createUser: vi.fn(),
    updateUserById: vi.fn(),
    generateLink: vi.fn(),
    deleteUser: vi.fn(),
  },
  serviceFrom: vi.fn(),
  viewer: { current: { status: "signed_out" } as Record<string, unknown> },
  requestHeaders: new Headers(),
}));

vi.mock("./actions", () => ({
  acceptInvitation: mocks.acceptInvitation,
  createAccountAndAccept: mocks.createAccountAndAccept,
  moveToInvitedWorkspace: mocks.moveToInvitedWorkspace,
  signOutToInvitation: mocks.signOutToInvitation,
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.requestHeaders }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    rpc: mocks.rpc,
    from: mocks.serviceFrom,
    auth: { admin: mocks.admin },
  }),
}));
vi.mock("@/lib/classes/viewer", () => ({ readViewer: async () => mocks.viewer.current }));

import WorkspaceInvitePage, { dynamic, metadata } from "./page";

const PENDING = {
  state: "pending",
  workspace_name: "Ada’s workspace",
  inviter_name: "Ada Lovelace",
  inviter_email: "ada@school.edu",
  invited_email: INVITED,
  expires_at: "2026-10-16T12:00:00.000Z",
};

let reply: Reply;
/** What `org_invite_move_preview` answers. By default: a database that does not have it yet. */
let preview: Reply;
const NO_SUCH_FUNCTION: Reply = { data: null, error: { code: "PGRST202" } };
const previewOf = (status: string, over: Record<string, unknown> = {}): Reply => ({
  data: [
    {
      status,
      leaving_workspace: null,
      leaving_workspace_id: null,
      bank_count: null,
      class_count: null,
      ...over,
    },
  ],
  error: null,
});

async function renderPage(token = TOKEN) {
  const page = await WorkspaceInvitePage({
    params: Promise.resolve({ token }),
    searchParams: Promise.resolve({}),
  } satisfies PageProps<"/w/[token]">);
  return render(page);
}

function signedIn(over: Record<string, unknown> = {}) {
  mocks.viewer.current = {
    status: "signed_in",
    userId: "user-1",
    email: INVITED,
    role: null,
    displayName: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  reply = { data: [PENDING], error: null };
  preview = NO_SUCH_FUNCTION;
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "org_invite_move_preview" ? preview : reply,
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.viewer.current = { status: "signed_out" };
  mocks.requestHeaders = new Headers({
    "x-vercel-id": "iad1::test",
    "x-vercel-forwarded-for": "203.0.113.7",
    "x-forwarded-for": "198.51.100.66",
  });
});

describe("/w/[token]: opening the link", () => {
  it("only looks the token up: a mail scanner's visit accepts nothing and makes nothing", async () => {
    for (const viewer of [null, { role: null }, { role: "student" }, { email: "x@other.edu" }]) {
      if (viewer) signedIn(viewer);
      else mocks.viewer.current = { status: "signed_out" };
      (await renderPage()).unmount();
    }
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(Array(4).fill("resolve_org_invite"));
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    expect(mocks.createAccountAndAccept).not.toHaveBeenCalled();
    expect(mocks.signOutToInvitation).not.toHaveBeenCalled();
    for (const call of Object.values(mocks.admin)) expect(call).not.toHaveBeenCalled();
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it("counts the lookup on the platform's address for the caller, never a header of theirs", async () => {
    await renderPage();
    expect(mocks.rpc).toHaveBeenCalledWith("resolve_org_invite", {
      token: TOKEN,
      client_key: "203.0.113.7",
    });
  });

  it("asks for no Referer, no indexing and no stored copy", () => {
    expect(metadata.referrer).toBe("no-referrer");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("/w/[token]: a link that leads nowhere", () => {
  it("shows one page for an unknown token, a malformed one and a refused lookup", async () => {
    const pages: string[] = [];
    reply = { data: [], error: null };
    const unknown = await renderPage();
    pages.push(unknown.container.innerHTML);
    unknown.unmount();
    const malformed = await renderPage("not a token <b>");
    pages.push(malformed.container.innerHTML);
    malformed.unmount();
    reply = { data: null, error: { code: "PT429" } };
    pages.push((await renderPage()).container.innerHTML);

    expect(pages[0]).toContain(INVITE_NOT_VALID_HEADING);
    expect(pages[1]).toBe(pages[0]);
    expect(pages[2]).toBe(pages[0]);
    expect(screen.getByRole("heading", { level: 1, name: INVITE_NOT_VALID_HEADING })).toBeVisible();
  });

  it("never puts the token on the page", async () => {
    reply = { data: [], error: null };
    const { container } = await renderPage();
    expect(container.innerHTML).not.toContain(TOKEN);
  });

  it.each(["expired", "revoked", "accepted"] as const)(
    "says plainly when it is %s",
    async (state) => {
      reply = { data: [{ ...PENDING, state }], error: null };
      await renderPage();
      expect(screen.getByText(INVITE_CLOSED[state])).toBeVisible();
      expect(screen.queryByRole("button")).toBeNull();
    },
  );

  it("says nothing about the token when the database cannot answer", async () => {
    reply = { data: null, error: { code: "08006" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(INVITE_UNAVAILABLE);
    expect(screen.queryByRole("heading", { name: INVITE_NOT_VALID_HEADING })).toBeNull();
  });
});

describe("/w/[token]: a visitor", () => {
  it("is offered an account on the invited address, which cannot be changed or posted", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Ada Lovelace invited you to teach in Ada’s workspace",
      }),
    ).toBeVisible();
    const email = screen.getByLabelText("Email address");
    expect(email).toHaveValue(INVITED);
    expect(email).toHaveAttribute("readonly");
    expect(email).not.toHaveAttribute("name");
    expect(screen.getByLabelText("Your name")).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
    const button = screen.getByRole("button", { name: "Create account and join" });
    expect(new FormData(button.closest("form")!).has("email")).toBe(false);
  });

  it("can sign in to an account they already have, and come back", async () => {
    await renderPage();
    expect(screen.getByRole("link", { name: "Sign in to accept" })).toHaveAttribute(
      "href",
      `/sign-in?next=${encodeURIComponent(`/w/${TOKEN}`)}`,
    );
  });

  it("names the inviter by address when they have no name, and renders every name as text", async () => {
    reply = {
      data: [
        {
          ...PENDING,
          inviter_name: null,
          inviter_email: "ada@school.edu",
          workspace_name: '<img src=x onerror="alert(1)">',
        },
      ],
      error: null,
    };
    const { container } = await renderPage();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: 'ada@school.edu invited you to teach in <img src=x onerror="alert(1)">',
      }),
    ).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("/w/[token]: someone signed in", () => {
  it("as the invited address, with no role: one button, and nothing else to fill in", async () => {
    signedIn({ email: "Grace.Hopper@School.edu" });
    await renderPage();
    expect(screen.getByRole("button", { name: "Join workspace" })).toBeVisible();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.getByText(/You are signed in as Grace\.Hopper@School\.edu/)).toBeVisible();
  });

  it("as another address: told to sign out, and shown the invited address only in part", async () => {
    signedIn({ email: "someone@else.org" });
    const { container } = await renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "This invitation is for another address" }),
    ).toBeVisible();
    expect(container.textContent).toContain("g***@s***.edu");
    expect(container.innerHTML).not.toContain(INVITED);
    expect(container.innerHTML).not.toContain("hopper");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Join workspace" })).toBeNull();
  });

  it.each([
    ["student", INVITE_REFUSED.student],
    ["instructor", INVITE_REFUSED.already_teaches],
    ["admin", INVITE_REFUSED.already_teaches],
  ])("as the invited address but a %s: told why, with no button", async (role, message) => {
    signedIn({ role });
    await renderPage();
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks about a move for the session's own account, and only for a teacher", async () => {
    signedIn({ role: "instructor", userId: "teacher-9" });
    await renderPage();
    expect(mocks.rpc).toHaveBeenCalledWith("org_invite_move_preview", {
      p_user: "teacher-9",
      token: TOKEN,
    });
    mocks.rpc.mockClear();
    for (const role of [null, "student"]) {
      signedIn({ role });
      (await renderPage()).unmount();
    }
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(Array(2).fill("resolve_org_invite"));
  });

  it("as a teacher who may move: names the workspace left, counts what is lost, and asks", async () => {
    signedIn({ role: "instructor" });
    preview = previewOf("move_needs_confirmation", {
      leaving_workspace: "Grace’s workspace",
      leaving_workspace_id: "00000000-0000-4000-8000-0000000000d4",
      bank_count: 3,
      class_count: 1,
    });
    const { container } = await renderPage();
    // The form carries which workspace the sentence is about.
    expect(container.querySelector('input[type="hidden"][name="leaving"]')).toHaveValue(
      "00000000-0000-4000-8000-0000000000d4",
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Ada Lovelace invited you to teach in Ada’s workspace",
      }),
    ).toBeVisible();
    expect(screen.getByText(/You teach in Grace’s workspace now\./)).toBeVisible();
    expect(screen.getByText(/lose access to its 3 item banks and 1 class/)).toBeVisible();
    const box = screen.getByRole("checkbox", {
      name: "I understand that I will leave Grace’s workspace and lose access to everything in it.",
    });
    expect(box).not.toBeChecked();
    expect(box).toBeRequired();
    expect(screen.getByRole("button", { name: "Leave and join workspace" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Join workspace" })).toBeNull();
    // Opening the page moved nobody.
    expect(mocks.moveToInvitedWorkspace).not.toHaveBeenCalled();
  });

  it("draws the name of the workspace left as text", async () => {
    signedIn({ role: "instructor" });
    preview = previewOf("move_needs_confirmation", {
      leaving_workspace: "<img src=x onerror=alert(1)><b>Mine</b>",
      leaving_workspace_id: "00000000-0000-4000-8000-0000000000d4",
      bank_count: 0,
      class_count: 0,
    });
    const { container } = await renderPage();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)><b>Mine</b>");
    expect(container.querySelector("img, b")).toBeNull();
  });

  it.each([
    "already_member",
    "admin_account",
    "teaches_shared",
    "founder_with_members",
    "students_depend",
  ] as const)("as a teacher who may not move (%s): told why, with no button", async (reason) => {
    signedIn({ role: "admin" });
    preview = previewOf(reason);
    await renderPage();
    expect(screen.getByText(INVITE_REFUSED[reason])).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it.each([
    ["the database does not have the function yet", NO_SUCH_FUNCTION],
    ["the database cannot answer", { data: null, error: { code: "08006" } }],
    ["the answer is one nobody knows", previewOf("promoted")],
    ["the counts are missing", previewOf("move_needs_confirmation", { leaving_workspace: "X" })],
    ["the account turned out not to teach", previewOf("not_teaching")],
  ])("offers a teacher no move when %s", async (_why, answer) => {
    signedIn({ role: "instructor" });
    preview = answer;
    await renderPage();
    expect(screen.getByText(INVITE_REFUSED.already_teaches)).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("who has already accepted is shown the way to authoring", async () => {
    reply = { data: [{ ...PENDING, state: "accepted" }], error: null };
    signedIn({ role: "instructor" });
    await renderPage();
    expect(screen.getByRole("link", { name: "Go to your item banks" })).toHaveAttribute(
      "href",
      "/author",
    );
  });
});
