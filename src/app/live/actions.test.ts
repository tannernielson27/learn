import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSource, StartSessionResult } from "@/lib/supabase/sessions";

/**
 * Starting a live session from a case study (#184). What is pinned: the source is named as a case
 * study and never as a bank, every refusal goes back to the case study's own page with its reason,
 * and a started session opens its console.
 */

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

const AUTHOR_CLIENT = { marker: "author" };
const requireAuthor = vi.fn<(next: string) => Promise<{ supabase: typeof AUTHOR_CLIENT }>>(
  async () => ({ supabase: AUTHOR_CLIENT }),
);
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: (next: string) => requireAuthor(next),
}));

const startSession =
  vi.fn<(client: unknown, source: SessionSource) => Promise<StartSessionResult>>();
vi.mock("@/lib/supabase/sessions", () => ({
  startSession: (client: unknown, source: SessionSource) => startSession(client, source),
}));

const { startCaseStudyLiveSession, startLiveSession } = await import("./actions");

const CASE = "00000000-0000-4000-8000-000000000003";
const BANK = "00000000-0000-4000-8000-000000000002";
const SESSION = "00000000-0000-4000-8000-0000000000a1";

beforeEach(() => {
  redirected.mockClear();
  requireAuthor.mockClear();
  startSession.mockReset();
});

describe("startCaseStudyLiveSession", () => {
  it("starts from the case study and opens the console", async () => {
    startSession.mockResolvedValue({ ok: true, sessionId: SESSION });
    await expect(startCaseStudyLiveSession(CASE)).rejects.toThrow(`redirect:/live/${SESSION}`);
    expect(requireAuthor).toHaveBeenCalledWith(`/author/case-studies/${CASE}`);
    expect(startSession).toHaveBeenCalledWith(AUTHOR_CLIENT, { kind: "case_study", id: CASE });
  });

  it("sends a refusal back to the case study with its reason", async () => {
    startSession.mockResolvedValue({ ok: false, reason: "empty" });
    await expect(startCaseStudyLiveSession(CASE)).rejects.toThrow(
      `redirect:/author/case-studies/${CASE}?live=empty`,
    );
  });

  it("refuses an id that is not one before asking anyone", async () => {
    await expect(startCaseStudyLiveSession("../banks")).rejects.toThrow("redirect:/author");
    expect(requireAuthor).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });
});

describe("startLiveSession", () => {
  it("still starts a bank as a bank", async () => {
    startSession.mockResolvedValue({ ok: true, sessionId: SESSION });
    await expect(startLiveSession(BANK)).rejects.toThrow(`redirect:/live/${SESSION}`);
    expect(startSession).toHaveBeenCalledWith(AUTHOR_CLIENT, { kind: "bank", id: BANK });
  });
});
