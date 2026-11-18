import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EncryptedPDFError,
  PDFArray,
  PDFDocument,
  PDFRawStream,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { extractPdfPages, inspectPdf, planPageChunks } from "./pdf";
import { buildEncryptedPdf, buildPdf, buildPermissionsPdf, utf8 } from "./testing/fixtures";

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

  // #592: a PDF that only restricts copying is encrypted, but opens with no password.
  it("counts the pages of a PDF that has only a permissions password", async () => {
    const pdf = await buildPermissionsPdf(3);
    // The fixture really is encrypted: the library refuses it when it is given no password.
    await expect(PDFDocument.load(pdf)).rejects.toThrow(EncryptedPDFError);
    expect(await inspectPdf(pdf)).toEqual({ ok: true, pages: 3 });
  });

  it("refuses an encrypted PDF whose object streams could decode past the limit", async () => {
    const pdf = await buildPermissionsPdf(1);
    // An object stream of 100 KB: deflate could expand it to 100 MB once it is decrypted.
    const bomb = Buffer.concat([
      Buffer.from(pdf.subarray(0, 9)),
      Buffer.from(
        "\n9999 0 obj\n<< /Type /ObjStm /Filter /FlateDecode /Length 100000 >>\nstream\n",
      ),
      Buffer.alloc(100_000, 0x41),
      Buffer.from("\nendstream\nendobj\n"),
      Buffer.from(pdf.subarray(9)),
    ]);
    expect(await inspectPdf(new Uint8Array(bomb))).toMatchObject({
      ok: false,
      code: "too_complex",
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

  // #592: Claude cannot read an encrypted document, so a chunk must come out plain.
  it("cuts plain, readable chunks from a PDF with only a permissions password", async () => {
    const source = await buildPermissionsPdf(4);
    const chunk = await extractPdfPages(source, 2, 3);
    expect(Buffer.from(chunk).toString("latin1")).not.toContain("/Encrypt");
    // Loads with no password and no `ignoreEncryption`, as a reader with no key would.
    const read = await PDFDocument.load(chunk);
    expect(read.isEncrypted).toBe(false);
    expect(read.getPages().map((page) => page.getWidth())).toEqual([202, 203]);
    // The page's own content decodes to drawing operators, so it was decrypted, not copied as noise.
    const contents = read.getPage(0).node.Contents();
    const stream = contents instanceof PDFArray ? contents.lookup(0, PDFRawStream) : contents;
    if (!(stream instanceof PDFRawStream)) throw new Error("the page has no content stream");
    const decoded = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
    expect(decoded).toMatch(/\bBT\b[\s\S]*\bTj\b/);
  });

  it("refuses a range outside the document", async () => {
    const source = await buildPdf(3);
    await expect(extractPdfPages(source, 2, 4)).rejects.toThrow(/range/);
    await expect(extractPdfPages(source, 0, 1)).rejects.toThrow(/range/);
  });
});
