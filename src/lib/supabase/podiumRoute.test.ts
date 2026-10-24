import { beforeEach, describe, expect, it, vi } from "vitest";
import { REPORT_FIXTURE } from "@/lib/live/reportFixture";

const authorForRoute = vi.fn();
const readSessionReport = vi.fn();

vi.mock("@/lib/authoring/session", () => ({ authorForRoute: () => authorForRoute() }));
vi.mock("./sessionReport", () => ({
  readSessionReport: (...args: unknown[]) => readSessionReport(...args),
}));

const { sessionPodiumResponse } = await import("./podiumRoute");

const SESSION = "00000000-0000-4000-8000-0000000000a1";
const HOST = "00000000-0000-4000-8000-0000000000f1";

const fromStage = (site = "same-origin") =>
  new Request(`http://localhost/live/${SESSION}/podium`, { headers: { "sec-fetch-site": site } });

/** A client whose `sessions` read answers with this row, as row level security left it. */
function client(row: { host_id: string } | null, error: { message: string } | null = null) {
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: row, error }) }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq };
}

const ended = (status = "ended") => ({
  session: { id: SESSION, title: "Cardiac week 3", status, openedAt: "", closedAt: null },
  input: REPORT_FIXTURE,
});

beforeEach(() => {
  authorForRoute.mockReset();
  readSessionReport.mockReset();
});

const asHost = (db = client({ host_id: HOST })) => {
  authorForRoute.mockResolvedValue({ status: "ok", supabase: db, userId: HOST });
  return db;
};

describe("sessionPodiumResponse", () => {
  it("is not found for an id that is not a uuid, without reading anything", async () => {
    expect((await sessionPodiumResponse(fromStage(), "nope")).status).toBe(404);
    expect(authorForRoute).not.toHaveBeenCalled();
  });

  it("refuses a read started from another site", async () => {
    expect((await sessionPodiumResponse(fromStage("cross-site"), SESSION)).status).toBe(403);
    expect(authorForRoute).not.toHaveBeenCalled();
  });

  it("refuses anyone who is not a teacher", async () => {
    authorForRoute.mockResolvedValue({ status: "signed_out" });
    expect((await sessionPodiumResponse(fromStage(), SESSION)).status).toBe(401);
    authorForRoute.mockResolvedValue({ status: "forbidden", role: "student" });
    expect((await sessionPodiumResponse(fromStage(), SESSION)).status).toBe(403);
    expect(readSessionReport).not.toHaveBeenCalled();
  });

  it("reads with the teacher's own client, so row level security decides", async () => {
    const db = asHost();
    readSessionReport.mockResolvedValue(ended());
    await sessionPodiumResponse(fromStage(), SESSION);
    expect(db.from).toHaveBeenCalledWith("sessions");
    expect(db.select).toHaveBeenCalledWith("host_id");
    expect(db.eq).toHaveBeenCalledWith("id", SESSION);
    expect(readSessionReport).toHaveBeenCalledWith(db, SESSION);
  });

  it("is not found for a session row level security hides", async () => {
    asHost(client(null));
    const response = await sessionPodiumResponse(fromStage(), SESSION);
    expect(response.status).toBe(404);
    expect(readSessionReport).not.toHaveBeenCalled();
  });

  it("is not found for a colleague's session in the same workspace: only its own teacher", async () => {
    asHost(client({ host_id: "00000000-0000-4000-8000-0000000000f2" }));
    expect((await sessionPodiumResponse(fromStage(), SESSION)).status).toBe(404);
    expect(readSessionReport).not.toHaveBeenCalled();
  });

  it("refuses a session that has not ended", async () => {
    asHost();
    readSessionReport.mockResolvedValue(ended("running"));
    expect((await sessionPodiumResponse(fromStage(), SESSION)).status).toBe(409);
  });

  it("answers 500 when a read fails, never a half podium", async () => {
    asHost(client(null, { message: "boom" }));
    expect((await sessionPodiumResponse(fromStage(), SESSION)).status).toBe(500);
    asHost();
    readSessionReport.mockRejectedValue(new Error("could not read responses"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await sessionPodiumResponse(fromStage(), SESSION)).status).toBe(500);
  });

  it("answers the top places by the report's totals, names and points only, never cached", async () => {
    asHost();
    readSessionReport.mockResolvedValue(ended());
    const response = await sessionPodiumResponse(fromStage(), SESSION);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      podium: {
        entries: [
          { displayName: "Ava", points: 5, place: 1, tied: false },
          { displayName: "Ben", points: 2, place: 2, tied: false },
          { displayName: "=cmd|' /C calc'!A0", points: 1, place: 3, tied: false },
        ],
        more: 0,
      },
    });
  });

  it("answers no podium when nobody answered", async () => {
    asHost();
    readSessionReport.mockResolvedValue({
      ...ended(),
      input: { ...REPORT_FIXTURE, responses: [] },
    });
    const response = await sessionPodiumResponse(fromStage(), SESSION);
    expect(await response.json()).toEqual({ podium: null });
  });
});
