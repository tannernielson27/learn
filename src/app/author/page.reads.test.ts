import { beforeEach, describe, expect, it, vi } from "vitest";
import { roundTrips } from "@/lib/testing/roundTrips";

/**
 * perf-audit #14: how many round trips in a row the library home waits on. Every read is faked as
 * a trip (see `roundTrips`); the page's own logic, and `readOrgProgress`, run for real. The Get
 * started checklist's three reads and the welcome's do not need the library, so they start beside
 * it; only the list of every quiz, when the open view does not already hold it, waits for it.
 */

const FOLDER = "00000000-0000-4000-8000-0000000000f1";
const QUIZ = { id: "00000000-0000-4000-8000-0000000000b1", name: "Cardiac", itemCount: 3 };

let rt = roundTrips();
let library: { ready: boolean; folders: unknown[]; quizzes: unknown[] };

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const supabase = {
  auth: { getClaims: () => rt.trip("claims", { data: { claims: { sub: "u" } } }) },
  from: (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const step of ["select", "eq"]) builder[step] = () => builder;
    builder.limit = () => rt.trip(table, { data: [], error: null });
    return builder;
  },
};

vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: () => rt.trip("auth", { supabase, orgId: "org", userId: "u", email: "" }),
}));
vi.mock("@/lib/authoring/libraryData", () => ({
  readLibrary: () => rt.trip("library", () => library),
}));
vi.mock("@/lib/authoring/banks", () => ({ listBanks: () => rt.trip("listBanks", [QUIZ]) }));
vi.mock("@/lib/supabase/practiceShares", () => ({
  listSharedClassNamesByBank: () => rt.trip("shares", new Map()),
}));
vi.mock("@/lib/onboarding/teacherWelcome", async (original) => ({
  ...(await original<typeof import("@/lib/onboarding/teacherWelcome")>()),
  readTeacherWelcomeState: () => rt.trip("welcome", null),
}));

const action = () => vi.fn();
vi.mock("@/app/author/actions", () => ({ createBank: action() }));
vi.mock("@/app/author/libraryActions", () => ({
  createLibraryFolderAction: action(),
  createQuizInFolderAction: action(),
  deleteLibraryFolderAction: action(),
  moveQuizzesAction: action(),
  renameLibraryFolderAction: action(),
}));
vi.mock("@/app/author/onboardingActions", () => ({
  hideGetStarted: action(),
  importSample: action(),
  markOnboarded: action(),
}));
vi.mock("@/app/sign-in/actions", () => ({ resendConfirmation: action() }));
vi.mock("@/app/live/actions", () => ({ startLiveSession: action() }));

const { default: AuthorHomePage } = await import("./page");

const render = (query: Record<string, string> = {}) =>
  rt.run(() => AuthorHomePage({ searchParams: Promise.resolve(query) } as never));

const CHECKLIST = ["classes", "assignments", "sessions"];

beforeEach(() => {
  rt = roundTrips();
  library = { ready: true, folders: [], quizzes: [QUIZ] };
});

describe("the library home's round trips (perf-audit #14)", () => {
  it("reads the checklist and the welcome beside the library: 2 trips in a row, not 3", async () => {
    const result = await render();
    expect(result.ok).toBe(true);
    for (const read of ["library", "shares", "claims", "welcome", ...CHECKLIST]) {
      expect(rt.waveOf(read)).toBe(2);
    }
    expect(rt.waveOf("listBanks")).toBeUndefined();
    expect(result.waves).toBe(2);
  });

  it("with folders at the top, only the list of every quiz waits for the library: 3, not 4", async () => {
    library = {
      ready: true,
      folders: [{ id: FOLDER, parentId: null, name: "Week 1" }],
      quizzes: [],
    };
    const result = await render();
    expect(result.ok).toBe(true);
    for (const read of ["welcome", ...CHECKLIST]) expect(rt.waveOf(read)).toBe(2);
    expect(rt.waveOf("listBanks")).toBe(3);
    expect(result.waves).toBe(3);
  });

  it("reads no checklist or welcome inside a folder, and a folder that is not there is a 404", async () => {
    const result = await render({ folder: FOLDER });
    expect(!result.ok && (result.error as Error).message).toBe("notFound");
    for (const read of ["welcome", "listBanks", ...CHECKLIST]) {
      expect(rt.waveOf(read)).toBeUndefined();
    }
  });
});
