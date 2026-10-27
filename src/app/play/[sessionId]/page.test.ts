import { beforeEach, describe, expect, it, vi } from "vitest";
import { PARTICIPANT_COOKIE } from "@/lib/live/participantToken";
import type { VerifiedAccount } from "@/lib/supabase/verifiedAccount";

/**
 * The phone's page resumes whoever the cookie names. What is pinned here is ADR 0013 decision 2
 * on this page: a participant linked to an account is not resumed for a browser where that account
 * is not the one signed in, and an account check that could not be made changes nothing.
 * Everything after the check is stubbed; its own tests live with it.
 */

const SESSION = "3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6071";
const PARTICIPANT = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SECRET = "a".repeat(48);
const MEMBER = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === PARTICIPANT_COOKIE && cookieValue ? { name, value: cookieValue } : undefined,
  }),
}));

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

const SERVICE_CLIENT = { marker: "service" };
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => SERVICE_CLIENT }));

const checkParticipant = vi.fn();
const heldBySomeoneElse = vi.fn();
vi.mock("@/lib/supabase/participants", () => ({
  checkParticipant: (...args: unknown[]) => checkParticipant(...args),
  heldBySomeoneElse: (...args: unknown[]) => heldBySomeoneElse(...args),
}));

const verifiedAccount = vi.fn<() => Promise<VerifiedAccount>>();
vi.mock("@/lib/supabase/verifiedAccount", () => ({ verifiedAccount: () => verifiedAccount() }));

vi.mock("@/lib/supabase/sessions", () => ({
  readPublicSessionState: async () => ({
    status: "lobby",
    position: 0,
    revealed: false,
    total: 3,
    startedAt: null,
  }),
}));
vi.mock("@/lib/supabase/sessionRecord", () => ({
  readSessionRecords: async () => ({ record: null, runs: [] }),
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

const render = () => PlaySessionPage({ params: Promise.resolve({ sessionId: SESSION }) } as never);

beforeEach(() => {
  vi.clearAllMocks();
  cookieValue = `${SESSION}.${PARTICIPANT}.${SECRET}`;
  checkParticipant.mockResolvedValue({
    ok: true,
    participant: {
      participantId: PARTICIPANT,
      displayName: "Mia Chen",
      joinedAt: 0,
      sessionStatus: "lobby",
      mode: "instructor_paced",
      title: "Cardiac bank",
    },
  });
  verifiedAccount.mockResolvedValue({ status: "signed_in", id: MEMBER });
  heldBySomeoneElse.mockResolvedValue(false);
});

describe("/play/[sessionId] on a shared browser (ADR 0013)", () => {
  it("resumes the participant the cookie names when it is this browser's to resume", async () => {
    await expect(render()).resolves.toBeTruthy();
    expect(redirected).not.toHaveBeenCalled();
    expect(heldBySomeoneElse).toHaveBeenCalledWith(
      SERVICE_CLIENT,
      { sessionId: SESSION, participantId: PARTICIPANT, secret: SECRET },
      { status: "signed_in", id: MEMBER },
    );
  });

  it("sends a browser holding someone else's linked participant to the join form", async () => {
    verifiedAccount.mockResolvedValue({ status: "signed_out" });
    heldBySomeoneElse.mockResolvedValue(true);
    await expect(render()).rejects.toThrow("redirect:/join");
  });

  it("hands the account check's own answer on, unavailable included, for it to keep as before", async () => {
    verifiedAccount.mockResolvedValue({ status: "unavailable" });
    await expect(render()).resolves.toBeTruthy();
    expect(heldBySomeoneElse).toHaveBeenCalledWith(SERVICE_CLIENT, expect.anything(), {
      status: "unavailable",
    });
  });

  it("asks nothing about the account for a token the database did not match", async () => {
    checkParticipant.mockResolvedValue({ ok: false, reason: "unknown" });
    await expect(render()).rejects.toThrow("redirect:/join");
    expect(verifiedAccount).not.toHaveBeenCalled();
    expect(heldBySomeoneElse).not.toHaveBeenCalled();
  });
});
