import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLASS_PAGE_FIXTURE_CLASS } from "./classPageFixture";
import { PROGRESS_FIXTURE } from "./classProgressFixture";

const authorForRoute = vi.fn();
const readClass = vi.fn();
const readClassProgress = vi.fn();

vi.mock("@/lib/authoring/session", () => ({ authorForRoute: () => authorForRoute() }));
vi.mock("@/lib/supabase/classes", () => ({
  readClass: (...args: unknown[]) => readClass(...args),
}));
vi.mock("@/lib/supabase/classProgress", () => ({
  readClassProgress: (...args: unknown[]) => readClassProgress(...args),
}));

const { classProgressCsvDownload } = await import("./progressCsvRoute");

const CLASS = CLASS_PAGE_FIXTURE_CLASS.id;
const NOW = new Date("2026-10-27T15:00:00Z");

const fromPage = (site = "same-origin") =>
  new Request(`http://localhost/author/classes/${CLASS}/progress/csv`, {
    headers: { "sec-fetch-site": site },
  });

beforeEach(() => {
  authorForRoute.mockReset();
  readClass.mockReset();
  readClassProgress.mockReset();
});

describe("classProgressCsvDownload", () => {
  it("is not found for an id that is not a uuid, without reading anything", async () => {
    expect((await classProgressCsvDownload(fromPage(), "nope", NOW)).status).toBe(404);
    expect(authorForRoute).not.toHaveBeenCalled();
  });

  it("refuses a download started from another site", async () => {
    expect((await classProgressCsvDownload(fromPage("cross-site"), CLASS, NOW)).status).toBe(403);
    expect(authorForRoute).not.toHaveBeenCalled();
  });

  it("refuses anyone who is not a teacher, before reading the class", async () => {
    authorForRoute.mockResolvedValue({ status: "signed_out" });
    expect((await classProgressCsvDownload(fromPage(), CLASS, NOW)).status).toBe(401);
    authorForRoute.mockResolvedValue({ status: "forbidden" });
    const refused = await classProgressCsvDownload(fromPage(), CLASS, NOW);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "Only teachers can download progress." });
    expect(readClass).not.toHaveBeenCalled();
    expect(readClassProgress).not.toHaveBeenCalled();
  });

  it("is not found for a class row level security hides, and reads no progress for it", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "other-workspace" });
    readClass.mockResolvedValue(null);
    const response = await classProgressCsvDownload(fromPage(), CLASS, NOW);
    expect(readClass).toHaveBeenCalledWith("other-workspace", CLASS);
    expect(response.status).toBe(404);
    expect(readClassProgress).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 500, saying nothing more, when a read fails", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    readClass.mockResolvedValue(CLASS_PAGE_FIXTURE_CLASS);
    readClassProgress.mockRejectedValue(new Error("could not read class progress: boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await classProgressCsvDownload(fromPage(), CLASS, NOW);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("boom");
  });

  it("downloads the grid as the teacher, uncached, with a safe file name", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    readClass.mockResolvedValue(CLASS_PAGE_FIXTURE_CLASS);
    readClassProgress.mockResolvedValue(PROGRESS_FIXTURE);
    const response = await classProgressCsvDownload(fromPage(), CLASS, NOW);
    expect(readClassProgress).toHaveBeenCalledWith("client", CLASS);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="nur-310-adult-health-fall-progress-2026-10-27.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body.startsWith("Student,Email,")).toBe(true);
    expect(body).toContain("Kai Ortiz,kai.ortiz@example.test,60,Absent,52");
  });
});
