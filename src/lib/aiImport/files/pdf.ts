import { EncryptedPDFError, PDFDocument } from "@cantoo/pdf-lib";
import { MAX_BATCH_PAGES, PDF_CHUNK_OVERLAP, PDF_CHUNK_PAGES } from "./limits";
import { guardEncryptedPdfStreams, guardPdfStreams } from "./pdfGuard";
import { reject, type Rejection } from "./reasons";

/**
 * PDFs (#341): count the pages, refuse a password-protected or damaged one, and cut it into
 * chunks of about 8 pages with one page of overlap, each sent to Claude as a PDF of its own so
 * scans, colour and layout survive (ADR 0008, Pipeline step 2).
 *
 * A PDF that only restricts copying or editing (#592) is encrypted too, with an owner password,
 * but it opens in any reader with no password at all. It is read the same way: decrypted with
 * the empty password. Only a PDF that needs a password to open is refused. The chunks cut from
 * it are new, plain PDFs, so Claude can read them.
 *
 * The library is @cantoo/pdf-lib, the maintained fork of pdf-lib (which has had no release since
 * 2021): pure JavaScript, no native code and no network, and it can copy pages between documents.
 */

export interface PageRange {
  /** 1-based and inclusive, as `ai_import_chunks.page_from` and `page_to` store them. */
  pageFrom: number;
  pageTo: number;
}

export type PdfInspection = { ok: true; pages: number } | Rejection;

const LOAD_OPTIONS = { updateMetadata: false, throwOnInvalidObject: false } as const;

/** Chunks of `size` pages, each starting on the last page of the one before. */
export function planPageChunks(
  pages: number,
  size: number = PDF_CHUNK_PAGES,
  overlap: number = PDF_CHUNK_OVERLAP,
): PageRange[] {
  if (!Number.isInteger(pages) || pages < 1) throw new Error("A PDF has at least one page.");
  if (!Number.isInteger(size) || !Number.isInteger(overlap) || overlap < 0 || overlap >= size) {
    throw new Error("A chunk must be longer than its overlap.");
  }
  const chunks: PageRange[] = [];
  let pageFrom = 1;
  for (;;) {
    const pageTo = Math.min(pageFrom + size - 1, pages);
    chunks.push({ pageFrom, pageTo });
    if (pageTo === pages) return chunks;
    pageFrom = pageTo - overlap + 1;
  }
}

class PdfTooComplex extends Error {}

/** The PDF is encrypted and the empty password does not open it. */
class PdfNeedsPassword extends Error {}

/**
 * What the library says when the empty password does not open a document, or the document is
 * locked in a way it cannot open at all (a certificate, a cipher it does not have). It throws
 * these as plain errors, so they are told from a damaged file by their words.
 */
const NOT_OPENED =
  /^(?:NEEDS PASSWORD|Password incorrect|unknown encryption method|unsupported encryption algorithm)$/;

/**
 * An encrypted PDF opened as a reader opens it when asked for no password. The decrypted object
 * streams are bounded first, as `guardPdfStreams` bounds a plain PDF's. Any other failure is a
 * damaged file, and is left to say so.
 */
async function loadWithEmptyPassword(bytes: Uint8Array): Promise<PDFDocument> {
  if (guardEncryptedPdfStreams(bytes) !== "ok") {
    throw new PdfTooComplex("PDF streams may decode too large");
  }
  try {
    return await PDFDocument.load(bytes, { ...LOAD_OPTIONS, password: "" });
  } catch (error) {
    if (error instanceof Error && NOT_OPENED.test(error.message)) throw new PdfNeedsPassword();
    throw error;
  }
}

/** Loads a PDF only after `guardPdfStreams` has bounded what loading it decodes. */
async function load(bytes: Uint8Array): Promise<PDFDocument> {
  if (guardPdfStreams(bytes) !== "ok") throw new PdfTooComplex("PDF streams decode too large");
  try {
    return await PDFDocument.load(bytes, LOAD_OPTIONS);
  } catch (error) {
    if (error instanceof EncryptedPDFError) return loadWithEmptyPassword(bytes);
    throw error;
  }
}

/** The page count, or why the PDF is refused. */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  let pages: number;
  try {
    const pdf = await load(bytes);
    pages = pdf.getPageCount();
  } catch (error) {
    if (error instanceof PdfTooComplex) return reject("too_complex");
    if (error instanceof PdfNeedsPassword) return reject("encrypted");
    return reject("corrupt");
  }
  if (!Number.isInteger(pages) || pages < 1) return reject("corrupt");
  if (pages > MAX_BATCH_PAGES) return reject("too_many_pages");
  return { ok: true, pages };
}

/** A new PDF holding pages `pageFrom` to `pageTo` (1-based, inclusive) of `bytes`. */
export async function extractPdfPages(
  bytes: Uint8Array,
  pageFrom: number,
  pageTo: number,
): Promise<Uint8Array> {
  const source = await load(bytes);
  const count = source.getPageCount();
  if (
    !Number.isInteger(pageFrom) ||
    !Number.isInteger(pageTo) ||
    pageFrom < 1 ||
    pageTo < pageFrom ||
    pageTo > count
  ) {
    throw new Error(`Page range ${pageFrom}-${pageTo} is outside a ${count}-page PDF.`);
  }
  const chunk = await PDFDocument.create({ updateMetadata: false });
  const indices = Array.from({ length: pageTo - pageFrom + 1 }, (_, i) => pageFrom - 1 + i);
  const copied = await chunk.copyPages(source, indices);
  for (const page of copied) chunk.addPage(page);
  return chunk.save();
}
