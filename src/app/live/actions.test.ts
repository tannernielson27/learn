import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSource, StartSessionResult } from "@/lib/supabase/sessions";

/**
 * Starting a live session from a case study (#184). What is pinned: the source is named as a case
 * study and never as a bank, every refusal goes back to the case study's own page with its reason,
 * and a started session opens its console. Since ADR 0013 either may be started for a class: the
 * form's class id is passed on only when it is one, and the database decides whether it is the
 * teacher's.
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
  vi.fn<
    (
      client: unknown,
      source: SessionSource,
      paced?: string,
      classId?: string | null,
    ) => Promise<StartSessionResult>
  >();
vi.mock("@/lib/supabase/sessions", () => ({
  startSession: (...args: Parameters<typeof startSession>) => startSession(...args),
}));

const { startCaseStudyLiveSession, startLiveSession } = await import("./actions");

const CASE = "00000000-0000-4000-8000-000000000003";
const BANK = "00000000-0000-4000-8000-000000000002";
const SESSION = "00000000-0000-4000-8000-0000000000a1";
const CLASS = "00000000-0000-4000-8000-0000000000d1";

function startForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

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
    expect(startSession).toHaveBeenCalledWith(
      AUTHOR_CLIENT,
      { kind: "case_study", id: CASE },
      "instructor_paced",
      null,
    );
  });

  it("starts for the class the form names", async () => {
    startSession.mockResolvedValue({ ok: true, sessionId: SESSION });
    await expect(startCaseStudyLiveSession(CASE, startForm({ classId: CLASS }))).rejects.toThrow(
      `redirect:/live/${SESSION}`,
    );
    expect(startSession).toHaveBeenCalledWith(
      AUTHOR_CLIENT,
      { kind: "case_study", id: CASE },
      "instructor_paced",
      CLASS,
    );
  });

  it("sends a class that is not the teacher's back with its own reason", async () => {
    startSession.mockResolvedValue({ ok: false, reason: "class" });
    await expect(startCaseStudyLiveSession(CASE, startForm({ classId: CLASS }))).rejects.toThrow(
      `redirect:/author/case-studies/${CASE}?live=class`,
    );
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
  it("still starts a bank as a bank, a quick session for no class", async () => {
    startSession.mockResolvedValue({ ok: true, sessionId: SESSION });
    await expect(startLiveSession(BANK)).rejects.toThrow(`redirect:/live/${SESSION}`);
    expect(startSession).toHaveBeenCalledWith(
      AUTHOR_CLIENT,
      { kind: "bank", id: BANK },
      "instructor_paced",
      null,
    );
  });

  it("starts for the class chosen, with the pacing chosen", async () => {
    startSession.mockResolvedValue({ ok: true, sessionId: SESSION });
    await expect(
      startLiveSession(BANK, startForm({ pacing: "student_paced", classId: CLASS })),
    ).rejects.toThrow(`redirect:/live/${SESSION}`);
    expect(startSession).toHaveBeenCalledWith(
      AUTHOR_CLIENT,
      { kind: "bank", id: BANK },
      "student_paced",
      CLASS,
    );
  });

  it("reads No class, and anything that is not a class id, as a quick session", async () => {
    startSession.mockResolvedValue({ ok: true, sessionId: SESSION });
    for (const classId of ["", "not-a-class", "../classes"]) {
      await expect(startLiveSession(BANK, startForm({ classId }))).rejects.toThrow(
        `redirect:/live/${SESSION}`,
      );
      expect(startSession).toHaveBeenLastCalledWith(
        AUTHOR_CLIENT,
        { kind: "bank", id: BANK },
        "instructor_paced",
        null,
      );
    }
  });

  it("sends a class that is not the teacher's back to the quiz with its own reason", async () => {
    startSession.mockResolvedValue({ ok: false, reason: "class" });
    await expect(startLiveSession(BANK, startForm({ classId: CLASS }))).rejects.toThrow(
      `redirect:/author/banks/${BANK}?live=class`,
    );
  });
});
