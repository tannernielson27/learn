import { beforeEach, describe, expect, it, vi } from "vitest";
import { roundTrips } from "@/lib/testing/roundTrips";

/**
 * perf-audit #15: how many round trips in a row the student home waits on. Every read is faked as
 * a trip (see `roundTrips`); the page's own logic runs for real. The attempt counts need only the
 * open assignments, so they follow that read rather than waiting for the history, which is a chain
 * of its own (the submit at close, then the reads after it).
 */

const ASSIGNMENT = "00000000-0000-4000-8000-0000000000a1";

let rt = roundTrips();
let open: { id: string }[] | null;

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const supabase = { auth: { getClaims: () => rt.trip("claims", { data: { claims: {} } }) } };

vi.mock("@/lib/classes/viewer", () => ({
  requireStudent: () => rt.trip("auth", { supabase, userId: "u", email: "" }),
}));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/assignments/attemptStore", () => ({ historyStore: () => ({}) }));
vi.mock("@/lib/assignments/history", () => ({
  // The submit at close, then the four reads after it: two trips in a row at the least.
  loadStudentRecord: () =>
    rt
      .trip("submitAtClose", undefined)
      .then(() => rt.trip("history", { history: [], steps: null })),
}));
vi.mock("@/lib/supabase/classInvites", () => ({ myClasses: () => rt.trip("classes", []) }));
vi.mock("@/lib/supabase/assignments", () => ({
  listOpenAssignments: () => rt.trip("openAssignments", () => open),
}));
vi.mock("@/lib/supabase/attempts", () => ({
  listMyAttemptProgress: (_client: unknown, ids: string[]) =>
    rt.trip("attemptProgress", () => (ids.length === 0 ? new Map() : null)),
}));
vi.mock("@/lib/supabase/practice", () => ({ readMyPracticeBanks: () => rt.trip("practice", []) }));
vi.mock("@/lib/supabase/liveResults", () => ({ readMyLiveResults: () => rt.trip("live", []) }));
vi.mock("@/app/sign-in/actions", () => ({ resendConfirmation: vi.fn() }));
vi.mock("@/app/learn/actions", () => ({ joinClassWithCode: vi.fn() }));

const { default: StudentHomePage } = await import("./page");

beforeEach(() => {
  rt = roundTrips();
  open = [{ id: ASSIGNMENT }];
});

describe("the student home's round trips (perf-audit #15)", () => {
  it("reads the attempt counts as soon as the open assignments are in, not after the history", async () => {
    const result = await rt.run(() => StudentHomePage());
    expect(result.ok).toBe(true);
    expect(rt.waveOf("openAssignments")).toBe(2);
    expect(rt.waveOf("attemptProgress")).toBe(3);
    expect(rt.waveOf("history")).toBe(3);
    // auth, then the first reads, then the history and the counts side by side.
    expect(result.waves).toBe(3);
  });

  it("still asks for the counts of no assignments when the open list did not load", async () => {
    open = null;
    const result = await rt.run(() => StudentHomePage());
    expect(result.ok).toBe(true);
    expect(rt.log.filter((entry) => entry.name === "attemptProgress")).toHaveLength(1);
  });
});
