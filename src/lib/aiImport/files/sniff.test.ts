import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES } from "./limits";
import { sniffFile } from "./sniff";
import { DOCM_MAIN, buildDocx, buildPdf, para, utf8 } from "./testing/fixtures";

const corpus = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(process.cwd(), "test", "ai-import", "corpus", name)));

const OLE = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

describe("sniffFile", () => {
  it("reads a PDF by its bytes, whatever it is called", async () => {
    const pdf = await buildPdf(1);
    expect(sniffFile(pdf, "quiz.pdf")).toEqual({ ok: true, kind: "pdf" });
    expect(sniffFile(pdf, "quiz.docx")).toEqual({ ok: true, kind: "pdf" });
    expect(sniffFile(corpus("04-two-column-handout.pdf"), "handout.pdf")).toMatchObject({
      kind: "pdf",
    });
  });

  it("reads a .docx as a zip with a Word main document", () => {
    expect(sniffFile(corpus("02-cardiac-unit-quiz.docx"), "quiz.docx")).toEqual({
      ok: true,
      kind: "docx",
    });
    expect(sniffFile(buildDocx({ body: para("Hello") }), "renamed.txt")).toEqual({
      ok: true,
      kind: "docx",
    });
  });

  it("refuses a macro-enabled .docm, by its content type or its VBA part", () => {
    const docm = buildDocx({ body: para("x"), mainType: DOCM_MAIN });
    expect(sniffFile(docm, "quiz.docm")).toMatchObject({ ok: false, code: "macro_enabled" });
    expect(sniffFile(docm, "quiz.docx")).toMatchObject({ ok: false, code: "macro_enabled" });
    const hidden = buildDocx({ body: para("x"), extra: { "word/vbaProject.bin": "fake" } });
    expect(sniffFile(hidden, "quiz.docx")).toMatchObject({ ok: false, code: "macro_enabled" });
  });

  it("refuses an old .doc and a password-protected Word file (both OLE)", () => {
    expect(sniffFile(OLE, "quiz.doc")).toMatchObject({ ok: false, code: "legacy_doc" });
  });

  it("refuses other zips: a spreadsheet, a zip with no content types, a broken zip", () => {
    const xlsx = buildDocx({ body: para("x"), mainType: "application/vnd.ms-excel.sheet+xml" });
    expect(sniffFile(xlsx, "sheet.xlsx")).toMatchObject({ code: "unsupported" });
    const truncated = buildDocx({ body: para("x") }).slice(0, 40);
    expect(sniffFile(truncated, "quiz.docx")).toMatchObject({ code: "corrupt" });
  });

  it("reads UTF-8 text as Markdown or text by the name, with or without a BOM", () => {
    expect(sniffFile(utf8("# Quiz\n\nQuestion 1"), "quiz.md")).toEqual({ ok: true, kind: "md" });
    expect(sniffFile(utf8("Quiz"), "quiz.markdown")).toEqual({ ok: true, kind: "md" });
    expect(sniffFile(utf8("\uFEFFQuiz"), "quiz.TXT")).toEqual({ ok: true, kind: "txt" });
    expect(sniffFile(corpus("01-med-surg-review.md"), "review.md")).toEqual({
      ok: true,
      kind: "md",
    });
  });

  it("refuses text that is not UTF-8, and text under another name", () => {
    expect(sniffFile(Uint8Array.from([0xff, 0xfe, 0x41, 0x00]), "a.txt")).toMatchObject({
      code: "not_utf8",
    });
    expect(sniffFile(Uint8Array.from([0x41, 0xc3, 0x28]), "a.txt")).toMatchObject({
      code: "not_utf8",
    });
    expect(sniffFile(utf8("{\\rtf1 hello}"), "a.txt")).toMatchObject({ code: "unsupported" });
    expect(sniffFile(utf8("<html></html>"), "page.html")).toMatchObject({ code: "unsupported" });
    expect(sniffFile(utf8("a\u0000b"), "a.txt")).toMatchObject({ code: "unsupported" });
  });

  it("refuses images and other binaries", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(sniffFile(png, "scan.pdf")).toMatchObject({ code: "unsupported" });
  });

  it("refuses an empty file and one over 25 MB before reading it", () => {
    expect(sniffFile(new Uint8Array(0), "a.txt")).toMatchObject({ code: "empty" });
    expect(sniffFile(new Uint8Array(MAX_FILE_BYTES + 1), "a.txt")).toMatchObject({
      code: "too_large",
    });
  });
});
