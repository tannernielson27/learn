import { beforeEach, describe, expect, it, vi } from "vitest";
import { roundTrips } from "@/lib/testing/roundTrips";

/**
 * How many round trips in a row a class's pages wait on. Every read is faked as a trip (see
 * `roundTrips`); the pages' own logic runs for real. The class row, the open tab's reads, a
 * student's progress and the quiz list need nothing from each other: each is a read under RLS or
 * through a function that answers only the class's own teacher. They start together; the class
 * row is still awaited first, so a class this teacher cannot see is a 404 as before.
 */

const CLASS = "00000000-0000-4000-8000-0000000000c1";
const STUDENT = "00000000-0000-4000-8000-0000000000d1";

let rt = roundTrips();
let detail: unknown;
let progressFails: boolean;

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "learn.test" }) }));
vi.mock("@/lib/http/siteOrigin", () => ({ canonicalSiteOrigin: () => "https://learn.test" }));

vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: () => rt.trip("auth", { supabase: {}, orgId: "org", userId: "u", email: "" }),
}));
vi.mock("@/lib/supabase/classes", () => ({
  readClass: () => rt.trip("class", () => detail),
  classRoster: () => rt.trip("roster", []),
}));
vi.mock("@/lib/supabase/assignments", () => ({
  listClassAssignments: () => rt.trip("assignments", []),
}));
vi.mock("@/lib/supabase/practiceShares", () => ({ listClassShares: () => rt.trip("shares", []) }));
vi.mock("@/lib/authoring/banks", () => ({ listBanks: () => rt.trip("banks", []) }));
vi.mock("@/lib/supabase/classProgress", () => ({
  readClassProgress: () =>
    rt.trip("progress", () => {
      if (progressFails) throw new Error("class progress could not be read");
      return { rows: [], steps: [] };
    }),
  listClassSessions: () => rt.trip("sessions", []),
}));
vi.mock("@/lib/classes/progress", async (original) => ({
  ...(await original<typeof import("@/lib/classes/progress")>()),
  buildClassProgress: () => ({ students: [] }),
}));
vi.mock("@/lib/classes/studentProgress", () => ({
  studentProgress: (_progress: unknown, id: string) => (id === STUDENT ? { id } : null),
}));

const action = () => vi.fn();
vi.mock("@/app/author/assignments/actions", () => ({
  deleteAssignment: action(),
  editAssignment: action(),
}));
vi.mock("@/app/author/practice/actions", () => ({
  shareClassWithBank: action(),
  stopSharing: action(),
}));
vi.mock("@/app/author/classes/actions", () => ({
  removeStudent: action(),
  renameClass: action(),
  rotateInvite: action(),
  setTimeZone: action(),
}));
vi.mock("@/app/live/actions", () => ({ startClassLiveSession: action() }));

const { default: ClassPage } = await import("./page");
const { default: ClassStudentPage } = await import("./students/[profileId]/page");
const { default: ClassLiveStartPage } = await import("./start/page");

const classPage = (tab?: string) =>
  rt.run(() =>
    ClassPage({
      params: Promise.resolve({ classId: CLASS }),
      searchParams: Promise.resolve(tab ? { tab } : {}),
    } as never),
  );
const studentPage = (profileId = STUDENT) =>
  rt.run(() =>
    ClassStudentPage({ params: Promise.resolve({ classId: CLASS, profileId }) } as never),
  );
const startPage = () =>
  rt.run(() =>
    ClassLiveStartPage({
      params: Promise.resolve({ classId: CLASS }),
      searchParams: Promise.resolve({}),
    } as never),
  );

beforeEach(() => {
  rt = roundTrips();
  detail = {
    id: CLASS,
    name: "NUR 310",
    inviteToken: "tokentokentokentoken",
    joinCode: "ABCD2345",
    timeZone: "America/Denver",
  };
  progressFails = false;
});

describe("the class page's round trips", () => {
  it.each(["overview", "students", "progress", "sessions", "assignments", "settings"])(
    "reads the class beside the %s tab's reads: 2 trips in a row, not 3",
    async (tab) => {
      const result = await classPage(tab);
      expect(result.ok).toBe(true);
      expect(rt.waveOf("class")).toBe(2);
      for (const entry of rt.log.filter((read) => read.name !== "auth")) {
        expect(entry.wave).toBe(2);
      }
      expect(result.waves).toBe(2);
    },
  );

  it("is still a 404 for a class this teacher cannot see", async () => {
    detail = null;
    const result = await classPage("progress");
    expect(!result.ok && (result.error as Error).message).toBe("notFound");
  });
});

describe("a student's page in a class: round trips", () => {
  it("reads the class beside the progress: 2 trips in a row, not 3", async () => {
    const result = await studentPage();
    expect(result.ok).toBe(true);
    expect(rt.waveOf("class")).toBe(2);
    expect(rt.waveOf("progress")).toBe(2);
    expect(result.waves).toBe(2);
  });

  it("is still a 404 for a class this teacher cannot see, even when the progress read fails", async () => {
    detail = null;
    progressFails = true;
    const result = await studentPage();
    expect(!result.ok && (result.error as Error).message).toBe("notFound");
  });

  it("still throws a progress read that failed for a class they can see, and 404s a stranger", async () => {
    progressFails = true;
    const failed = await studentPage();
    expect(!failed.ok && (failed.error as Error).message).toBe("class progress could not be read");

    rt = roundTrips();
    progressFails = false;
    const stranger = await studentPage("00000000-0000-4000-8000-0000000000ee");
    expect(!stranger.ok && (stranger.error as Error).message).toBe("notFound");
  });
});

describe("a class's live start page: round trips", () => {
  it("reads the class beside the quiz list: 2 trips in a row, not 3", async () => {
    const result = await startPage();
    expect(result.ok).toBe(true);
    expect(rt.waveOf("class")).toBe(2);
    expect(rt.waveOf("banks")).toBe(2);
    expect(result.waves).toBe(2);
  });

  it("is still a 404 for a class this teacher cannot see", async () => {
    detail = null;
    const result = await startPage();
    expect(!result.ok && (result.error as Error).message).toBe("notFound");
  });
});
