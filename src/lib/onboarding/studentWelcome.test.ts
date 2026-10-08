import { describe, expect, it, vi } from "vitest";
import {
  readStudentWelcomeState,
  showStudentWelcome,
  STUDENT_WELCOME_SINCE,
  studentWelcomeSteps,
} from "./studentWelcome";

type Client = Parameters<typeof readStudentWelcomeState>[0];

function client(reply: { data: Record<string, unknown> | null; error: { code: string } | null }) {
  const eq = vi.fn(() => ({ maybeSingle: async () => reply }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as Client, from, select, eq };
}

const NEW = { onboardedAt: null, createdAt: "2026-10-09T15:00:00Z", displayName: "Kai Ortiz" };

describe("studentWelcomeSteps (#365)", () => {
  it("is three steps: the class, assignments and practice, then results and live sessions", () => {
    const steps = studentWelcomeSteps("Kai Ortiz", ["NUR 310"]);
    expect(steps.map((step) => step.title)).toEqual([
      "Welcome, Kai Ortiz",
      "Assignments and practice",
      "Results and live sessions",
    ]);
    expect(steps[0]!.body[0]).toBe("You are in NUR 310.");
    expect(steps[1]!.body.join(" ")).toMatch(/your class’s time zone/);
    expect(steps[2]!.body.join(" ")).toMatch(/enter the code your instructor shows/);
  });

  it.each([
    [["NUR 310", "NUR 320"], "You are in NUR 310 and NUR 320."],
    [["NUR 310", "NUR 320", "NUR 330", "NUR 340"], "You are in NUR 310, NUR 320 and 2 more."],
    [[], "You are signed in."],
  ])("names the classes %j", (classes, said) => {
    expect(studentWelcomeSteps(null, classes)[0]!.body[0]).toBe(said);
  });

  it("greets a student with no name without one", () => {
    expect(studentWelcomeSteps(null, ["NUR 310"])[0]!.title).toBe("Welcome to LeaRN");
    expect(studentWelcomeSteps("  ", ["NUR 310"])[0]!.title).toBe("Welcome to LeaRN");
  });

  it("has no emoji in its copy, and carries a class name as plain text", () => {
    const steps = studentWelcomeSteps("Kai", ["<b>NUR</b> 310"]);
    const copy = steps.flatMap((step) => [step.title, ...step.body]).join(" ");
    expect(copy).not.toMatch(/\p{Extended_Pictographic}/u);
    // Kept as typed: React escapes it where it is drawn.
    expect(steps[0]!.body[0]).toBe("You are in <b>NUR</b> 310.");
  });
});

describe("showStudentWelcome (#365)", () => {
  it("shows once, to a new student who is in a class", () => {
    expect(showStudentWelcome(NEW, 1)).toBe(true);
    expect(showStudentWelcome({ ...NEW, createdAt: STUDENT_WELCOME_SINCE }, 3)).toBe(true);
  });

  it("never shows again once finished or skipped", () => {
    expect(showStudentWelcome({ ...NEW, onboardedAt: "2026-10-09T16:00:00Z" }, 1)).toBe(false);
  });

  it("waits until the student is in a class", () => {
    expect(showStudentWelcome(NEW, 0)).toBe(false);
  });

  it("never interrupts a student who joined before this was released", () => {
    expect(showStudentWelcome({ ...NEW, createdAt: "2026-10-07T23:59:59Z" }, 1)).toBe(false);
    expect(showStudentWelcome({ ...NEW, createdAt: "2026-09-01T12:00:00Z" }, 2)).toBe(false);
  });

  it("does not show when the state, or the account's date, could not be read", () => {
    expect(showStudentWelcome(null, 1)).toBe(false);
    expect(showStudentWelcome({ ...NEW, createdAt: "not a date" }, 1)).toBe(false);
  });
});

describe("readStudentWelcomeState (#365)", () => {
  it("reads three columns of the caller's own profile, and nothing about any assignment", async () => {
    const fake = client({
      data: { onboarded_at: null, created_at: NEW.createdAt, display_name: "Kai Ortiz" },
      error: null,
    });
    expect(await readStudentWelcomeState(fake.client, "user-1")).toEqual(NEW);
    expect(fake.from).toHaveBeenCalledTimes(1);
    expect(fake.from).toHaveBeenCalledWith("profiles");
    expect(fake.select).toHaveBeenCalledWith("onboarded_at, created_at, display_name");
    expect(fake.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("is null when the read fails or finds nothing", async () => {
    const failed = client({ data: null, error: { code: "08006" } });
    expect(await readStudentWelcomeState(failed.client, "user-1")).toBeNull();
    const missing = client({ data: null, error: null });
    expect(await readStudentWelcomeState(missing.client, "user-1")).toBeNull();
  });
});
