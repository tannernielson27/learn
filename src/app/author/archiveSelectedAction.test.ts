import { beforeEach, describe, expect, it, vi } from "vitest";
import { ARCHIVE_ONE } from "@/lib/authoring/archiveSelection";
import { RATE_LIMIT_ERRORS } from "@/lib/authoring/rateLimit";

/**
 * The quiz page's archive (#471), with the author check, the limit and the writes faked: what the
 * action reads from the form, what it asks of the limit, and what it tells the page.
 */

const BANK = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f01";
const ITEM = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a01";
const CASE = "8a6f6ca1-4d5e-4f70-9b82-3d4e5f6a7b01";

const supabase = { tag: "client" };
const requireAuthor = vi.fn<(next: string) => Promise<{ supabase: typeof supabase }>>(async () => ({
  supabase,
}));
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: (next: string) => requireAuthor(next),
}));

const checkRateLimit = vi.fn(
  async () => ({ ok: true }) as { ok: true } | { ok: false; error: string },
);
vi.mock("@/lib/authoring/rateLimit", async (original) => ({
  ...(await original<typeof import("@/lib/authoring/rateLimit")>()),
  checkRateLimit: () => checkRateLimit(),
}));

const archiveSelection = vi.fn();
vi.mock("@/lib/authoring/archiveSelectionData", () => ({
  archiveSelection: (...args: unknown[]) => archiveSelection(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const { archiveSelectedAction } = await import("./archiveActions");

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

const IDLE = { status: "idle" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ ok: true });
});

describe("archiveSelectedAction", () => {
  it("archives the checked rows and says how many", async () => {
    archiveSelection.mockResolvedValue({ archived: { items: 1, caseStudies: 1 }, refusals: [] });
    const state = await archiveSelectedAction(
      BANK,
      IDLE,
      form([
        ["item", ITEM],
        ["caseStudy", CASE],
      ]),
    );
    expect(state).toEqual({
      status: "done",
      message: "Archived 1 question and 1 case study.",
      refusals: [],
    });
    expect(requireAuthor).toHaveBeenCalledWith(`/author/banks/${BANK}`);
    expect(archiveSelection).toHaveBeenCalledWith(supabase, BANK, {
      itemIds: [ITEM],
      caseStudyIds: [CASE],
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/author/banks/${BANK}`);
  });

  it("archives only the row whose own Archive sent the form", async () => {
    archiveSelection.mockResolvedValue({ archived: { items: 1, caseStudies: 0 }, refusals: [] });
    await archiveSelectedAction(
      BANK,
      IDLE,
      form([
        ["caseStudy", CASE],
        [ARCHIVE_ONE, `item:${ITEM}`],
      ]),
    );
    expect(archiveSelection).toHaveBeenCalledWith(supabase, BANK, {
      itemIds: [ITEM],
      caseStudyIds: [],
    });
  });

  it("keeps what stayed beside what was archived", async () => {
    archiveSelection.mockResolvedValue({
      archived: { items: 1, caseStudies: 0 },
      refusals: ["It is a step."],
    });
    expect(await archiveSelectedAction(BANK, IDLE, form([["item", ITEM]]))).toEqual({
      status: "done",
      message: "Archived 1 question.",
      refusals: ["It is a step."],
    });
  });

  it("is an error when nothing was archived", async () => {
    archiveSelection.mockResolvedValue({
      archived: { items: 0, caseStudies: 0 },
      refusals: ["It is a step."],
    });
    expect(await archiveSelectedAction(BANK, IDLE, form([["item", ITEM]]))).toEqual({
      status: "error",
      error: "Nothing was archived.",
      refusals: ["It is a step."],
    });
  });

  it("refuses an empty selection before signing in or writing", async () => {
    expect(await archiveSelectedAction(BANK, IDLE, form([]))).toEqual({
      status: "error",
      error: "Select at least one question or case study to archive.",
      refusals: [],
    });
    expect(requireAuthor).not.toHaveBeenCalled();
    expect(archiveSelection).not.toHaveBeenCalled();
  });

  it("refuses a quiz id that is not one", async () => {
    const state = await archiveSelectedAction("nope", IDLE, form([["item", ITEM]]));
    expect(state.status).toBe("error");
    expect(archiveSelection).not.toHaveBeenCalled();
  });

  it("asks the save limit first and writes nothing past it", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, error: RATE_LIMIT_ERRORS.limited });
    expect(await archiveSelectedAction(BANK, IDLE, form([["item", ITEM]]))).toEqual({
      status: "error",
      error: RATE_LIMIT_ERRORS.limited,
      refusals: [],
    });
    expect(archiveSelection).not.toHaveBeenCalled();
  });
});
