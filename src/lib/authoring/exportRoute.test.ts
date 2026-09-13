import { beforeEach, describe, expect, it, vi } from "vitest";

const authorForRoute = vi.fn();
const readItemExport = vi.fn();
const readCaseStudyExport = vi.fn();

vi.mock("./session", () => ({ authorForRoute: () => authorForRoute() }));
vi.mock("./importExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./importExport")>()),
  readItemExport: (...args: unknown[]) => readItemExport(...args),
  readCaseStudyExport: (...args: unknown[]) => readCaseStudyExport(...args),
}));

const { exportDownload } = await import("./exportRoute");

const ITEM_ID = "00000000-0000-4000-8000-000000000010";

/** A request as the browser sends it when the author follows the page's own Export JSON link. */
const fromPage = (site = "same-origin") =>
  new Request(`http://localhost/author/items/${ITEM_ID}/export`, {
    headers: { "sec-fetch-site": site },
  });

beforeEach(() => {
  authorForRoute.mockReset();
  readItemExport.mockReset();
  readCaseStudyExport.mockReset();
});

describe("exportDownload", () => {
  it("is not found for an id that is not a uuid, without reading anything", async () => {
    const response = await exportDownload(fromPage(), "item", "not-an-id");
    expect(response.status).toBe(404);
    expect(authorForRoute).not.toHaveBeenCalled();
  });

  it("refuses a download started from another site, before reading anything", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    const response = await exportDownload(fromPage("cross-site"), "item", ITEM_ID);
    expect(response.status).toBe(403);
    expect(authorForRoute).not.toHaveBeenCalled();
    expect(readItemExport).not.toHaveBeenCalled();
  });

  it("refuses anyone who is not an author", async () => {
    authorForRoute.mockResolvedValue({ status: "signed_out" });
    expect((await exportDownload(fromPage(), "item", ITEM_ID)).status).toBe(401);
    authorForRoute.mockResolvedValue({ status: "forbidden" });
    expect((await exportDownload(fromPage(), "item", ITEM_ID)).status).toBe(403);
    expect(readItemExport).not.toHaveBeenCalled();
  });

  it("downloads the envelope as a JSON file that is never cached", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    const envelope = { format: "learn.v1", items: [] };
    readItemExport.mockResolvedValue({ ok: true, envelope });
    const response = await exportDownload(fromPage(), "item", ITEM_ID);
    expect(readItemExport).toHaveBeenCalledWith("client", ITEM_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="item-${ITEM_ID}.learn.json"`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(await response.text())).toEqual(envelope);
  });

  it("allows a download typed or bookmarked in the address bar", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    readItemExport.mockResolvedValue({ ok: true, envelope: { format: "learn.v1", items: [] } });
    expect((await exportDownload(fromPage("none"), "item", ITEM_ID)).status).toBe(200);
  });

  it("says why a case study cannot be exported yet", async () => {
    authorForRoute.mockResolvedValue({ status: "ok", supabase: "client" });
    readCaseStudyExport.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Finish every step of this case study before exporting it.",
      blockers: ["Step 6 (Evaluate Outcomes) has no item yet."],
    });
    const response = await exportDownload(fromPage(), "caseStudy", ITEM_ID);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Finish every step of this case study before exporting it.",
      blockers: ["Step 6 (Evaluate Outcomes) has no item yet."],
    });
  });
});
