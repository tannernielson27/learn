import { beforeEach, describe, expect, it, vi } from "vitest";
import { REPORT_FIXTURE } from "@/lib/live/reportFixture";

const authorForRoute = vi.fn();
const readSessionReport = vi.fn();

vi.mock("@/lib/authoring/session", () => ({ authorForRoute: () => authorForRoute() }));
vi.mock("@/lib/supabase/sessionReport", () => ({
  readSessionReport: (...args: unknown[]) => readSessionReport(...args),
}));

const { reportCsvDownload } = await import("./reportCsvRoute");

const SESSION = "00000000-0000-4000-8000-0000000000a1";

const fromPage = (site = "same-origin") =>
  new Request(`http://localhost/live/${SESSION}/report/csv`, {
    headers: { "sec-fetch-site": site },
  });

const ended = {
  session: {
    id: SESSION,
    title: "Cardiac week 3",
    status: "ended",
    openedAt: "2026-09-22T10:00:00Z",
    closedAt: "2026-09-22T10:40:00Z",
  },
  input: REPORT_FIXTURE,
};

beforeEach(() => {
  authorForRoute.mockReset();
  readSessionReport.mockReset();
});

describe("reportCsvDownload", () => {
  it("is not found for an id that is not a uuid, without reading anything", async () => {
    const response = await reportCsvDownload(fromPage(), "nope");
    expect(response.status).toBe(404);
    expect(authorForRoute).not.toHaveBeenCalled();
  });

  it("refuses a download started from another site", async () => {
    const response = await reportCsvDownload(fromPage("cross-site"), SESSION);
    expect(response.status).toBe(403);
    expect(authorForRoute).not.toHaveBeenCalled();
  });

  it("refuses anyone who is not an author", async () => {
    authorForRoute.mockResolvedValue({ status: "signed_out" });
    expect((await reportCsvDownload(fromPage(), SESSION)).status).toBe(401);
    authorForRoute.mockResolvedValue({ status: "forbidden" });
    expect((await reportCsvDownload(fromPage(), SESSION)).status).toBe(403);
    expect(readSessionReport).not.toHaveBeenCalled();
  });

  it("is not found for another org's session, which row level security reads as absent", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "other-org-client" });
    readSessionReport.mockResolvedValue(null);
    const response = await reportCsvDownload(fromPage(), SESSION);
    expect(readSessionReport).toHaveBeenCalledWith("other-org-client", SESSION);
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("Cardiac");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a session that has not ended yet", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    readSessionReport.mockResolvedValue({
      ...ended,
      session: { ...ended.session, status: "running", closedAt: null },
    });
    expect((await reportCsvDownload(fromPage(), SESSION)).status).toBe(409);
  });

  it("downloads the report as a CSV attachment that is never cached", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    readSessionReport.mockResolvedValue(ended);
    const response = await reportCsvDownload(fromPage("none"), SESSION);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="cardiac-week-3-2026-09-22.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = new Uint8Array(await response.arrayBuffer());
    // A byte order mark, so a spreadsheet reads a name like "Zoë" as UTF-8.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes.slice(3));
    expect(text.startsWith("Student,Q1 mc-vitals")).toBe(true);
    expect(text).toContain("\r\n'=cmd|' /C calc'!A0,");
  });

  it("answers a failed read with a server error, not a partial file", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    readSessionReport.mockRejectedValue(new Error("could not read responses"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await reportCsvDownload(fromPage(), SESSION);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("could not read");
    // The detail goes to the server log, where it is useful, not to the browser.
    expect(logged).toHaveBeenCalledWith(
      "[report] could not read a session report",
      expect.objectContaining({ sessionId: SESSION, message: "could not read responses" }),
    );
    logged.mockRestore();
  });
});
