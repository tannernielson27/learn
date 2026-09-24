import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAssignmentReport } from "./report";

const authorForRoute = vi.fn();
const loadAssignmentReport = vi.fn();
const assignmentReportStore = vi.fn();

vi.mock("@/lib/authoring/session", () => ({ authorForRoute: () => authorForRoute() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => "service-client" }));
vi.mock("./attemptStore", () => ({
  assignmentReportStore: (...args: unknown[]) => assignmentReportStore(...args),
}));
vi.mock("./reportLoader", () => ({
  loadAssignmentReport: (...args: unknown[]) => loadAssignmentReport(...args),
}));

const { assignmentReportCsvDownload } = await import("./reportCsvRoute");

const ASSIGNMENT = "00000000-0000-4000-8000-0000000002a1";
const ITEM = "00000000-0000-4000-8000-00000000021a";

const fromPage = (site = "same-origin") =>
  new Request(`http://localhost/author/assignments/${ASSIGNMENT}/report/csv`, {
    headers: { "sec-fetch-site": site },
  });

const loaded = (released: boolean) => ({
  assignment: {
    id: ASSIGNMENT,
    classId: "c1",
    title: "Week 5: Heart failure",
    opensAt: "2026-09-21T09:00:00Z",
    closesAt: "2026-09-23T17:00:00Z",
    maxAttempts: 1,
    itemSet: [ITEM],
  },
  report: buildAssignmentReport({
    released,
    items: [{ position: 1, itemId: ITEM, ref: "mc-hf", type: "multiple_choice", cjmmStep: 1 }],
    students: [{ id: "s-evil", displayName: '=HYPERLINK("http://x")' }],
    attempts: [
      {
        studentId: "s-evil",
        id: "a1",
        number: 1,
        submittedAt: "2026-09-23T10:00:00Z",
        score: 1,
        maxScore: 1,
        marks: [{ itemId: ITEM, points: 1, maxPoints: 1 }],
      },
    ],
  }),
});

beforeEach(() => {
  authorForRoute.mockReset();
  loadAssignmentReport.mockReset();
  assignmentReportStore.mockReset().mockReturnValue("store");
});

describe("assignmentReportCsvDownload", () => {
  it("is not found for an id that is not a uuid, without reading anything", async () => {
    expect((await assignmentReportCsvDownload(fromPage(), "nope")).status).toBe(404);
    expect(authorForRoute).not.toHaveBeenCalled();
  });

  it("refuses a download started from another site", async () => {
    expect((await assignmentReportCsvDownload(fromPage("cross-site"), ASSIGNMENT)).status).toBe(
      403,
    );
    expect(authorForRoute).not.toHaveBeenCalled();
  });

  it("refuses anyone who is not an author, before any read", async () => {
    authorForRoute.mockResolvedValue({ status: "signed_out" });
    expect((await assignmentReportCsvDownload(fromPage(), ASSIGNMENT)).status).toBe(401);
    authorForRoute.mockResolvedValue({ status: "forbidden" });
    expect((await assignmentReportCsvDownload(fromPage(), ASSIGNMENT)).status).toBe(403);
    expect(loadAssignmentReport).not.toHaveBeenCalled();
    expect(assignmentReportStore).not.toHaveBeenCalled();
  });

  it("is not found for another org's assignment", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "other-org-client" });
    loadAssignmentReport.mockResolvedValue(null);
    const response = await assignmentReportCsvDownload(fromPage(), ASSIGNMENT);
    expect(assignmentReportStore).toHaveBeenCalledWith("other-org-client", "service-client");
    expect(loadAssignmentReport).toHaveBeenCalledWith("store", ASSIGNMENT, expect.any(Date));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses while the assignment is open: there are no scores to download", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    loadAssignmentReport.mockResolvedValue(loaded(false));
    const response = await assignmentReportCsvDownload(fromPage(), ASSIGNMENT);
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("HYPERLINK");
  });

  it("answers 500 without details when a read fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    loadAssignmentReport.mockRejectedValue(new Error("db down"));
    const response = await assignmentReportCsvDownload(fromPage(), ASSIGNMENT);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("db down");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("downloads the closed report as a CSV attachment that is never cached", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    loadAssignmentReport.mockResolvedValue(loaded(true));
    const response = await assignmentReportCsvDownload(fromPage(), ASSIGNMENT);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="week-5-heart-failure-2026-09-23.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await response.text();
    expect(body.split("\r\n")[1]).toBe(`"'=HYPERLINK(""http://x"")",1,1,1,100,1,Submitted`);
  });
});
