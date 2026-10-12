import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The workspace page, rendered with the real author check over a faked Supabase client. What is
 * pinned: a student and a visitor are turned away before anything is read, a self-registered
 * workspace gets the form and the pending list, the shared one gets a sentence and neither, and
 * names and addresses are drawn as text.
 */

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("./actions", () => ({
  inviteColleague: vi.fn(async () => ({ status: "idle" })),
  removeMember: vi.fn(async () => ({ ok: true })),
  revokeInvite: vi.fn(async () => ({ ok: true })),
  resendInvite: vi.fn(async () => ({ ok: true })),
}));

const USER = "00000000-0000-4000-8000-0000000000a1";
const ORG = "00000000-0000-4000-8000-000000000001";
const COLLEAGUE = "00000000-0000-4000-8000-0000000000b2";

type Reply = { data?: unknown; error?: { code?: string } | null };

let claims: Record<string, unknown> | null;
let tables: Record<string, Reply>;
let members: Reply;
/** What the read of `orgs.founder_id` answers. It is a read of its own, apart from the name. */
let founder: Reply;
const selected: [table: string, columns: unknown][] = [];

function builderFor(table: string) {
  const builder: Record<string, unknown> = {};
  let asked: unknown;
  for (const step of ["eq", "is", "order", "limit"]) builder[step] = () => builder;
  builder.select = (columns: unknown) => {
    asked = columns;
    selected.push([table, columns]);
    return builder;
  };
  builder.maybeSingle = async () =>
    table === "orgs" && asked === "founder_id"
      ? founder
      : (tables[table] ?? { data: null, error: null });
  builder.then = (resolve: (value: Reply) => unknown) =>
    resolve(tables[table] ?? { data: null, error: null });
  return builder;
}

const client = {
  auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
  from: vi.fn((table: string) => builderFor(table)),
  rpc: vi.fn<(name: string) => Promise<Reply>>(async () => members),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));

const { default: WorkspacePage } = await import("./page");

async function renderPage() {
  return render(await WorkspacePage());
}

beforeEach(() => {
  vi.clearAllMocks();
  selected.length = 0;
  claims = { sub: USER, email: "ada@school.edu" };
  tables = {
    profiles: { data: { org_id: ORG, role: "instructor" }, error: null },
    orgs: { data: { name: "Ada's workspace", self_registered: true }, error: null },
    org_invites: {
      data: [
        {
          id: "00000000-0000-4000-8000-0000000000e1",
          email: "kim@school.edu",
          created_at: "2026-10-08T10:00:00Z",
          expires_at: "2099-10-15T10:00:00Z",
        },
      ],
      error: null,
    },
  };
  members = {
    data: [
      {
        profile_id: USER,
        display_name: "Ada Lovelace",
        email: "ada@school.edu",
        role: "instructor",
        joined_at: "2026-10-01T10:00:00Z",
      },
    ],
    error: null,
  };
  founder = { data: { founder_id: USER }, error: null };
});

/** The workspace with a second teacher in it, who came in by invitation. */
function withColleague() {
  members = {
    data: [
      ...(members.data as unknown[]),
      {
        profile_id: COLLEAGUE,
        display_name: "Mary Seacole",
        email: "mary@school.edu",
        role: "instructor",
        joined_at: "2026-10-09T10:00:00Z",
      },
    ],
    error: null,
  };
}

describe("who reaches /author/workspace", () => {
  it("sends a signed-out visitor to sign in, and back here afterwards", async () => {
    claims = null;
    await expect(WorkspacePage()).rejects.toThrow("redirect:/sign-in?next=%2Fauthor%2Fworkspace");
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalledWith("org_invites");
  });

  it("sends a student to the student home, having read no member and no invitation", async () => {
    tables.profiles = { data: { org_id: ORG, role: "student" }, error: null };
    await expect(WorkspacePage()).rejects.toThrow("redirect:/learn");
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalledWith("org_invites");
    expect(client.from).not.toHaveBeenCalledWith("orgs");
  });

  it("sends an account with no role to the welcome page", async () => {
    tables.profiles = { data: { org_id: null, role: null }, error: null };
    await expect(WorkspacePage()).rejects.toThrow("redirect:/welcome");
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe("a self-registered workspace", () => {
  it("shows the name, the members, the invite form and the pending invitations", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Ada's workspace" })).toBeVisible();
    const memberRows = within(screen.getByRole("list", { name: "Members" })).getAllByRole(
      "listitem",
    );
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0]).toHaveTextContent("Ada Lovelace (you)");
    expect(screen.getByText("1 of 10 members")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Invite a colleague" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Colleague's email address" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send invitation" })).toBeVisible();
    const pending = screen.getByRole("list", { name: "Pending invitations" });
    expect(within(pending).getByRole("listitem")).toHaveTextContent("kim@school.edu");
    expect(
      screen.getByRole("button", { name: "Revoke the invitation to kim@school.edu" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Resend the invitation to kim@school.edu" }),
    ).toBeVisible();
  });

  it("reads members through org_members() and invitations by named columns", async () => {
    await renderPage();
    expect(client.rpc).toHaveBeenCalledWith("org_members");
    const columns = selected.filter(([table]) => table === "org_invites").map(([, c]) => String(c));
    expect(columns).toEqual(["id, email, created_at, expires_at"]);
  });

  it("says so when nothing is pending", async () => {
    tables.org_invites = { data: [], error: null };
    await renderPage();
    expect(screen.getByRole("heading", { level: 3, name: "No pending invitations" })).toBeVisible();
  });

  it("links back to the item banks", async () => {
    await renderPage();
    expect(screen.getByRole("link", { name: "Item banks" })).toHaveAttribute("href", "/author");
  });

  it("draws a workspace name and an address that look like markup as text", async () => {
    const name = '<script>alert("w")</script><h1>Owned</h1>';
    const address = "<img src=x onerror=alert(1)>@x.test";
    tables.orgs = { data: { name, self_registered: true }, error: null };
    tables.org_invites = {
      data: [{ id: "i1", email: address, created_at: "2026-10-08T10:00:00Z", expires_at: "x" }],
      error: null,
    };
    const { container } = await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(name);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("list", { name: "Pending invitations" })).toHaveTextContent(address);
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("says so when a list cannot be loaded, and keeps the rest of the page", async () => {
    members = { data: null, error: { code: "57014" } };
    tables.org_invites = { data: null, error: { code: "57014" } };
    await renderPage();
    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toContain("The members could not be loaded. Reload the page to try again.");
    expect(alerts).toContain("The invitations could not be loaded. Reload the page to try again.");
    expect(screen.getByRole("textbox", { name: "Colleague's email address" })).toBeVisible();
  });
});

describe("removing a colleague", () => {
  const removeMary = { name: "Remove Mary Seacole from the workspace" };

  it("marks who started the workspace and gives them a Remove on a colleague's row", async () => {
    withColleague();
    await renderPage();
    const rows = within(screen.getByRole("list", { name: "Members" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Started this workspace");
    expect(within(rows[0]!).queryByRole("button")).not.toBeInTheDocument();
    expect(rows[1]).not.toHaveTextContent("Started this workspace");
    expect(within(rows[1]!).getByRole("button", removeMary)).toBeVisible();
  });

  it("gives a colleague who did not start it no Remove, and still says who did", async () => {
    withColleague();
    founder = { data: { founder_id: COLLEAGUE }, error: null };
    await renderPage();
    const rows = within(screen.getByRole("list", { name: "Members" })).getAllByRole("listitem");
    expect(rows[1]).toHaveTextContent("Started this workspace");
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
  });

  it.each([
    ["the column is not in the database yet", { data: null, error: { code: "42703" } }],
    ["the workspace has no founder on record", { data: { founder_id: null }, error: null }],
    ["the read finds no row", { data: null, error: null }],
  ])("draws the whole page with no Remove and nobody marked when %s", async (_why, reply) => {
    withColleague();
    founder = reply;
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Ada's workspace" })).toBeVisible();
    expect(
      within(screen.getByRole("list", { name: "Members" })).getAllByRole("listitem"),
    ).toHaveLength(2);
    expect(screen.queryByText("Started this workspace")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Colleague's email address" })).toBeVisible();
  });

  it("reads the founder apart from the name, so one failing does not take the other", async () => {
    await renderPage();
    const columns = selected.filter(([table]) => table === "orgs").map(([, c]) => String(c));
    expect(columns.sort()).toEqual(["founder_id", "name, self_registered"]);
  });

  it("tells the inviter who can remove a colleague, and that a teacher elsewhere may move", async () => {
    await renderPage();
    const copy = screen.getByText(/They join this workspace as a teacher/);
    expect(copy).toHaveTextContent(
      "Only the person who started the workspace can remove a colleague",
    );
    expect(copy).toHaveTextContent("can accept only by leaving that workspace");
    expect(copy).not.toHaveTextContent("cannot be removed once they join");
  });
});

describe("a workspace that is not self-registered", () => {
  beforeEach(() => {
    tables.orgs = { data: { name: "LeaRN", self_registered: false }, error: null };
  });

  it("offers no Remove and marks nobody, even with a founder on record", async () => {
    withColleague();
    await renderPage();
    expect(screen.queryByText("Started this workspace")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the members and one sentence, and no way to invite", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "LeaRN" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Members" })).toBeVisible();
    expect(
      screen.getByText(
        "Inviting colleagues is not available in this workspace. LeaRN adds its teachers directly.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pending invitations" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Pending invitations" })).not.toBeInTheDocument();
    expect(screen.queryByText(/of 10 members/)).not.toBeInTheDocument();
  });
});

describe("a workspace that cannot be read", () => {
  it("says so, and offers no form", async () => {
    tables.orgs = { data: null, error: { code: "57014" } };
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Your workspace" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("The workspace could not be loaded.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
