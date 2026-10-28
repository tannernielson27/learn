import { beforeEach, describe, expect, it, vi } from "vitest";
import { PARTICIPANT_COOKIE } from "@/lib/live/participantToken";
import { roundTrips } from "@/lib/testing/roundTrips";

/**
 * perf-audit #16: how many round trips in a row the phone's page waits on. Every read is faked as
 * a trip (see `roundTrips`). The two reads of the session row (its public state, and its records)
 * need nothing from each other, so they run side by side, and both still only after the token and
 * the account check: neither does any checking of its own.
 */

const SESSION = "3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071";
const PARTICIPANT = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SECRET = "a".repeat(48);

let rt = roundTrips();
let checked: unknown;
let held: boolean;
let state: unknown;
let recordsFail: boolean;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === PARTICIPANT_COOKIE
        ? { name, value: `${SESSION}.${PARTICIPANT}.${SECRET}` }
        : undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/participants", () => ({
  checkParticipant: () => rt.trip("checkParticipant", () => checked),
  heldBySomeoneElse: () => rt.trip("heldBySomeoneElse", () => held),
}));
vi.mock("@/lib/supabase/verifiedAccount", () => ({
  verifiedAccount: () => rt.trip("verifiedAccount", { status: "signed_out" }),
}));
vi.mock("@/lib/supabase/sessions", () => ({
  readPublicSessionState: () => rt.trip("publicState", () => state),
}));
vi.mock("@/lib/supabase/sessionRecord", () => ({
  readSessionRecords: () =>
    rt.trip("records", () => {
      if (recordsFail) throw new Error("records failed");
      return { record: null, runs: [] };
    }),
}));
vi.mock("@/lib/liveSupabase/viewEntries", () => ({ roomRecord: () => null }));
vi.mock("@/lib/supabase/channelToken", () => ({
  mintChannelToken: () => "channel-token",
  readChannelSigningKey: () => "key",
}));
vi.mock("@/components/live/CaseStudyLayout", () => ({ CaseStudyLayout: () => null }));
vi.mock("@/components/live/StudentRoom", () => ({ StudentRoom: () => null }));
vi.mock("@/components/live/StudentPacedRoom", () => ({ StudentPacedRoom: () => null }));

const { default: PlaySessionPage } = await import("./page");

const render = () =>
  rt.run(() => PlaySessionPage({ params: Promise.resolve({ sessionId: SESSION }) } as never));

beforeEach(() => {
  rt = roundTrips();
  checked = {
    ok: true,
    participant: {
      participantId: PARTICIPANT,
      displayName: "Mia Chen",
      joinedAt: 0,
      sessionStatus: "lobby",
      mode: "instructor_paced",
      title: "Cardiac bank",
    },
  };
  held = false;
  state = { status: "lobby", position: 0, revealed: false, total: 3, startedAt: null };
  recordsFail = false;
});

describe("the phone's page round trips (perf-audit #16)", () => {
  it("reads the session's state and records together, after both checks: 4 in a row, not 5", async () => {
    const result = await render();
    expect(result.ok).toBe(true);
    expect(rt.waveOf("checkParticipant")).toBe(1);
    expect(rt.waveOf("verifiedAccount")).toBe(2);
    expect(rt.waveOf("heldBySomeoneElse")).toBe(3);
    expect(rt.waveOf("publicState")).toBe(4);
    expect(rt.waveOf("records")).toBe(4);
    expect(result.waves).toBe(4);
  });

  it("reads nothing of the session for a browser holding someone else's participant", async () => {
    held = true;
    const result = await render();
    expect(!result.ok && (result.error as Error).message).toBe("redirect:/join");
    expect(rt.waveOf("publicState")).toBeUndefined();
    expect(rt.waveOf("records")).toBeUndefined();
  });

  it("reads nothing of the session for a token the database did not match", async () => {
    checked = { ok: false, reason: "unknown" };
    const result = await render();
    expect(!result.ok && (result.error as Error).message).toBe("redirect:/join");
    expect(rt.waveOf("publicState")).toBeUndefined();
  });

  it("still sends a session that is not there to the join form, whatever the records say", async () => {
    state = null;
    recordsFail = true;
    const result = await render();
    expect(!result.ok && (result.error as Error).message).toBe("redirect:/join");
  });
});
