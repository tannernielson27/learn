import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { extractPdfPages, inspectPdf, planPageChunks } from "./pdf";
import { buildEncryptedPdf, buildPdf, utf8 } from "./testing/fixtures";

const corpus = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(process.cwd(), "test", "ai-import", "corpus", name)));

describe("planPageChunks", () => {
  it("splits 20 pages into three chunks of up to 8, each repeating one page", () => {
    expect(planPageChunks(20)).toEqual([
      { pageFrom: 1, pageTo: 8 },
      { pageFrom: 8, pageTo: 15 },
      { pageFrom: 15, pageTo: 20 },
    ]);
  });

  it("keeps a short document whole and gives one more page its own overlapping chunk", () => {
    expect(planPageChunks(1)).toEqual([{ pageFrom: 1, pageTo: 1 }]);
    expect(planPageChunks(8)).toEqual([{ pageFrom: 1, pageTo: 8 }]);
    expect(planPageChunks(9)).toEqual([
      { pageFrom: 1, pageTo: 8 },
      { pageFrom: 8, pageTo: 9 },
    ]);
  });

  it("covers 100 pages with every page in a chunk and every break overlapped", () => {
    const chunks = planPageChunks(100);
    expect(chunks[0].pageFrom).toBe(1);
    expect(chunks.at(-1)?.pageTo).toBe(100);
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].pageFrom).toBe(chunks[i - 1].pageTo);
    }
  });

  it("refuses a page count it cannot plan", () => {
    expect(() => planPageChunks(0)).toThrow();
    expect(() => planPageChunks(2.5)).toThrow();
  });
});

describe("inspectPdf", () => {
  it("counts the pages of a text PDF and of a scanned one", async () => {
    expect(await inspectPdf(await buildPdf(20))).toEqual({ ok: true, pages: 20 });
    expect(await inspectPdf(corpus("04-two-column-handout.pdf"))).toMatchObject({ ok: true });
    expect(await inspectPdf(corpus("05-scanned-quiz.pdf"))).toEqual({ ok: true, pages: 1 });
  });

  it("refuses a password-protected PDF", async () => {
    expect(await inspectPdf(await buildEncryptedPdf())).toMatchObject({
      ok: false,
      code: "encrypted",
    });
  });

  it("refuses a damaged PDF", async () => {
    expect(await inspectPdf(utf8("%PDF-1.7\nnot really a pdf"))).toMatchObject({
      ok: false,
      code: "corrupt",
    });
    expect(await inspectPdf(utf8("%PDF-"))).toMatchObject({ ok: false, code: "corrupt" });
  });

  it("refuses more than 100 pages", async () => {
    expect(await inspectPdf(await buildPdf(101))).toMatchObject({
      ok: false,
      code: "too_many_pages",
    });
  });
});

describe("extractPdfPages", () => {
  it("makes a PDF of just the chunk's pages, in order", async () => {
    const source = await buildPdf(20);
    const chunk = await extractPdfPages(source, 8, 15);
    const read = await PDFDocument.load(chunk);
    // Each fixture page is 200 + n points wide, so the widths name the pages.
    expect(read.getPages().map((page) => page.getWidth())).toEqual([
      208, 209, 210, 211, 212, 213, 214, 215,
    ]);
  });

  it("refuses a range outside the document", async () => {
    const source = await buildPdf(3);
    await expect(extractPdfPages(source, 2, 4)).rejects.toThrow(/range/);
    await expect(extractPdfPages(source, 0, 1)).rejects.toThrow(/range/);
  });
});
