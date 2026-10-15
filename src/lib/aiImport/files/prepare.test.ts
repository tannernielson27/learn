import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { MAX_BATCH_PAGES, CHARS_PER_PAGE } from "./limits";
import { chunkPayload, prepareFile } from "./prepare";
import { DOCM_MAIN, buildDocx, buildPdf, image, para, utf8 } from "./testing/fixtures";

const corpus = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(process.cwd(), "test", "ai-import", "corpus", name)));

describe("prepareFile", () => {
  it("splits a 20-page PDF into three chunks, each overlapping the last by one page", async () => {
    const bytes = await buildPdf(20);
    const prepared = await prepareFile(bytes, "quiz.pdf");
    expect(prepared).toMatchObject({
      ok: true,
      kind: "pdf",
      pages: 20,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      chunks: [
        { position: 0, pageFrom: 1, pageTo: 8, text: null },
        { position: 1, pageFrom: 8, pageTo: 15, text: null },
        { position: 2, pageFrom: 15, pageTo: 20, text: null },
      ],
    });
  });

  it("hands each PDF chunk over as a PDF of its pages", async () => {
    const bytes = await buildPdf(20);
    const prepared = await prepareFile(bytes, "quiz.pdf");
    if (!prepared.ok) throw new Error("refused");
    const payload = await chunkPayload(bytes, prepared, 1);
    expect(payload.type).toBe("pdf");
    const pdf = await PDFDocument.load(payload.type === "pdf" ? payload.bytes : new Uint8Array());
    expect(pdf.getPages().map((page) => page.getWidth())).toEqual([
      208, 209, 210, 211, 212, 213, 214, 215,
    ]);
    await expect(chunkPayload(bytes, prepared, 3)).rejects.toThrow(/no chunk/);
  });

  it("turns the corpus .docx into one markdown chunk with its highlights kept", async () => {
    const prepared = await prepareFile(corpus("02-cardiac-unit-quiz.docx"), "cardiac.docx");
    // Under 3,000 characters of text: one page, estimated from the text without its markup.
    expect(prepared).toMatchObject({ ok: true, kind: "docx", pages: 1, images: 0 });
    if (!prepared.ok) throw new Error("refused");
    expect(prepared.chunks).toHaveLength(1);
    expect(prepared.chunks[0]).toMatchObject({ position: 0, pageFrom: null, pageTo: null });
    expect(prepared.chunks[0].text).toContain("==<u>up 2.1 kg since yesterday</u>=={yellow}");
    const payload = await chunkPayload(corpus("02-cardiac-unit-quiz.docx"), prepared, 0);
    expect(payload).toEqual({ type: "text", text: prepared.chunks[0].text });
  });

  it("counts the pictures of a .docx", async () => {
    const prepared = await prepareFile(
      buildDocx({ body: para("See the image.") + para(image()) }),
      "x.docx",
    );
    expect(prepared).toMatchObject({ ok: true, images: 1 });
  });

  it("reads Markdown and text as they are", async () => {
    const md = await prepareFile(corpus("01-med-surg-review.md"), "review.md");
    expect(md).toMatchObject({ ok: true, kind: "md", pages: 2 });
    const txt = await prepareFile(utf8("\uFEFFQuestion 1\r\nWhich finding?"), "quiz.txt");
    expect(txt).toMatchObject({
      ok: true,
      kind: "txt",
      pages: 1,
      chunks: [{ position: 0, pageFrom: null, pageTo: null, text: "Question 1\nWhich finding?" }],
    });
  });

  it("estimates a long text file's pages and refuses one over 100", async () => {
    const long = utf8(`${"word ".repeat((MAX_BATCH_PAGES * CHARS_PER_PAGE) / 5)}\n\nmore`);
    expect(await prepareFile(long, "long.txt")).toMatchObject({
      ok: false,
      code: "too_many_pages",
    });
  });

  it("refuses a .docm, an empty document and an unsupported file, with a reason", async () => {
    const docm = buildDocx({ body: para("x"), mainType: DOCM_MAIN });
    expect(await prepareFile(docm, "quiz.docm")).toMatchObject({
      ok: false,
      code: "macro_enabled",
      reason: expect.stringContaining("macros"),
    });
    expect(await prepareFile(utf8("  \n\n "), "blank.md")).toMatchObject({ code: "no_text" });
    expect(await prepareFile(buildDocx({ body: para(image()) }), "pic.docx")).toMatchObject({
      code: "no_text",
    });
    expect(await prepareFile(utf8("x"), "slides.pptx")).toMatchObject({ code: "unsupported" });
  });

  it("refuses a PDF the checks refuse", async () => {
    expect(await prepareFile(utf8("%PDF-1.4 junk"), "a.pdf")).toMatchObject({ code: "corrupt" });
  });
});
