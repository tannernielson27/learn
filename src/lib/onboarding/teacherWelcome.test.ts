import { describe, expect, it, vi } from "vitest";
import { checklistSteps } from "./checklist";
import { readTeacherWelcomeState, showTeacherWelcome, teacherWelcomeSteps } from "./teacherWelcome";

type Client = Parameters<typeof readTeacherWelcomeState>[0];
type Reply = { data: Record<string, unknown> | null; error: { code: string } | null };

function client(replies: { profiles: Reply; orgs: Reply }) {
  const asked: { table: string; column: string; value: string }[] = [];
  const from = vi.fn((table: "profiles" | "orgs") => ({
    select: () => ({
      eq: (column: string, value: string) => {
        asked.push({ table, column, value });
        return { maybeSingle: async () => replies[table] };
      },
    }),
  }));
  return { client: { from } as unknown as Client, asked };
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

const NEW = { selfRegistered: true, onboardedAt: null, displayName: "Ada Lovelace" };

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
    });
    expect(fake.asked).toEqual(
      expect.arrayContaining([
        { table: "profiles", column: "id", value: "user-1" },
        { table: "orgs", column: "id", value: "org-1" },
      ]),
    );
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
