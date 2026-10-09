import { describe, expect, it, vi } from "vitest";
import { checklistSteps } from "./checklist";
import { readTeacherWelcomeState, showTeacherWelcome, teacherWelcomeSteps } from "./teacherWelcome";

type Client = Parameters<typeof readTeacherWelcomeState>[0];
type Reply = { data: Record<string, unknown> | null; error: { code: string } | null };

type ListReply = { data: { id: string }[] | null; error: { code: string } | null };

function client(replies: { profiles: Reply; orgs: Reply; org_invites?: ListReply }) {
  const asked: { table: string; column: string; value: string }[] = [];
  const selected: { table: string; columns: string }[] = [];
  const from = vi.fn((table: "profiles" | "orgs" | "org_invites") => ({
    select: (columns: string) => {
      selected.push({ table, columns });
      return {
        eq: (column: string, value: string) => {
          asked.push({ table, column, value });
          if (table === "org_invites") {
            return { limit: async () => replies.org_invites ?? { data: [], error: null } };
          }
          return { maybeSingle: async () => replies[table] };
        },
      };
    },
  }));
  return { client: { from } as unknown as Client, asked, selected };
}

describe("teacherWelcomeSteps (#364)", () => {
  it("is three steps: the workspace, question banks, then classes and sessions", () => {
    const steps = teacherWelcomeSteps("Ada Lovelace");
    expect(steps.map((step) => step.title)).toEqual([
      "Welcome, Ada Lovelace",
      "Start with a question bank",
      "Then a class, and your first session",
    ]);
    expect(steps[0]!.body.join(" ")).toMatch(/no other teacher can see them/);
    expect(steps[1]!.body.join(" ")).toMatch(/import the sample bank/);
    expect(steps[2]!.body.join(" ")).toMatch(/class code or invite link/);
  });

  it("greets a teacher with no name without one", () => {
    expect(teacherWelcomeSteps(null)[0]!.title).toBe("Welcome to LeaRN");
    expect(teacherWelcomeSteps("   ")[0]!.title).toBe("Welcome to LeaRN");
  });

  it("names the checklist's own steps, so the two cannot disagree", () => {
    const checklist = checklistSteps({ banks: [], hasClass: false, hasAssignmentOrSession: false });
    const said = teacherWelcomeSteps(null)
      .flatMap((step) => step.body)
      .join(" ");
    for (const step of checklist) expect(said).toContain(step.title);
  });

  it("has no emoji and no markup in its copy", () => {
    const copy = teacherWelcomeSteps("Ada")
      .flatMap((step) => [step.title, ...step.body])
      .join(" ");
    expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(copy).not.toMatch(/[<>]/);
  });
});

describe("teacherWelcomeSteps for a colleague who was invited", () => {
  const steps = teacherWelcomeSteps("Grace Hopper", { invited: true });
  const copy = steps.flatMap((step) => [step.title, ...step.body]).join(" ");

  it("is the short welcome: two steps, greeting them by name", () => {
    expect(steps.map((step) => step.title)).toEqual(["Welcome, Grace Hopper", "Where to start"]);
    expect(teacherWelcomeSteps(null, { invited: true })[0]!.title).toBe("Welcome to LeaRN");
  });

  it("says the workspace is shared, and never that nobody else can see it", () => {
    expect(copy).toMatch(/shared workspace/);
    expect(copy).toMatch(/the other teachers in it see and work on the same ones/);
    expect(copy).not.toMatch(/no other teacher/);
    expect(copy).not.toMatch(/your workspace/i);
  });

  it("leaves the sample bank out: the workspace is not theirs to fill", () => {
    expect(copy).not.toMatch(/sample bank/i);
    expect(copy).not.toMatch(/import/i);
  });

  it("has no emoji and no markup in its copy", () => {
    expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(copy).not.toMatch(/[<>]/);
  });

  it("is not what a teacher in a workspace of their own sees", () => {
    expect(teacherWelcomeSteps("Grace Hopper", { invited: false })).toHaveLength(3);
    expect(teacherWelcomeSteps("Grace Hopper")).toHaveLength(3);
  });
});

const NEW = {
  selfRegistered: true,
  onboardedAt: null,
  displayName: "Ada Lovelace",
  invited: false,
};

describe("showTeacherWelcome (#364)", () => {
  it("shows once, to a teacher in a workspace they signed up for", () => {
    expect(showTeacherWelcome({ ...NEW, selfRegistered: true })).toBe(true);
  });

  it("never shows again once finished or skipped", () => {
    expect(showTeacherWelcome({ ...NEW, onboardedAt: "2026-10-08T12:00:00Z" })).toBe(false);
  });

  it("never interrupts an instructor in the shared org", () => {
    expect(showTeacherWelcome({ ...NEW, selfRegistered: false })).toBe(false);
  });

  it("does not show when the state could not be read", () => {
    expect(showTeacherWelcome(null)).toBe(false);
  });
});

describe("readTeacherWelcomeState (#364)", () => {
  it("reads the caller's own profile and org", async () => {
    const fake = client({
      profiles: { data: { onboarded_at: null, display_name: "Ada Lovelace" }, error: null },
      orgs: { data: { self_registered: true }, error: null },
    });
    expect(await readTeacherWelcomeState(fake.client, "user-1", "org-1")).toEqual({
      selfRegistered: true,
      onboardedAt: null,
      displayName: "Ada Lovelace",
      invited: false,
    });
    expect(fake.asked).toEqual(
      expect.arrayContaining([
        { table: "profiles", column: "id", value: "user-1" },
        { table: "orgs", column: "id", value: "org-1" },
      ]),
    );
  });

  it("knows a colleague who came in by invitation, from the invitation they accepted", async () => {
    const fake = client({
      profiles: { data: { onboarded_at: null, display_name: "Grace Hopper" }, error: null },
      orgs: { data: { self_registered: true }, error: null },
      org_invites: { data: [{ id: "invite-1" }], error: null },
    });
    expect(await readTeacherWelcomeState(fake.client, "user-2", "org-1")).toMatchObject({
      invited: true,
    });
    expect(fake.asked).toContainEqual({
      table: "org_invites",
      column: "accepted_by",
      value: "user-2",
    });
    // `token_hash` has no grant: a `*` here would be refused.
    expect(fake.selected).toContainEqual({ table: "org_invites", columns: "id" });
  });

  it("still welcomes a new teacher when the invitations cannot be read", async () => {
    const fake = client({
      profiles: { data: { onboarded_at: null, display_name: "Ada Lovelace" }, error: null },
      orgs: { data: { self_registered: true }, error: null },
      org_invites: { data: null, error: { code: "42P01" } },
    });
    const state = await readTeacherWelcomeState(fake.client, "user-1", "org-1");
    expect(state).toMatchObject({ invited: false });
    expect(showTeacherWelcome(state)).toBe(true);
  });

  it.each([
    [
      { data: null, error: { code: "08006" } },
      { data: { self_registered: true }, error: null },
    ],
    [
      { data: { onboarded_at: null }, error: null },
      { data: null, error: { code: "08006" } },
    ],
    [
      { data: null, error: null },
      { data: { self_registered: true }, error: null },
    ],
    [
      { data: { onboarded_at: null }, error: null },
      { data: null, error: null },
    ],
  ] as const)("is null when a read fails or finds nothing", async (profiles, orgs) => {
    const fake = client({ profiles, orgs });
    expect(await readTeacherWelcomeState(fake.client, "user-1", "org-1")).toBeNull();
  });
});
