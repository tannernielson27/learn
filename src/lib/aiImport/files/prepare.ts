import { createHash } from "node:crypto";
import { docxToMarkdown } from "./docx";
import { CHARS_PER_PAGE, MAX_BATCH_PAGES } from "./limits";
import { extractPdfPages, inspectPdf, planPageChunks } from "./pdf";
import { reject, type Rejection } from "./reasons";
import { sniffFile, type FileKind } from "./sniff";
import { chunkText, decodeText, estimatePages } from "./text";

/**
 * Checks one uploaded file and plans what Claude reads of it (#341, ADR 0008 Pipeline step 2).
 * Pure apart from hashing: no network and no database, so the same bytes always give the same
 * chunks. `ai_import_chunks` stores only each chunk's position and pages, not its content, so
 * the parse step (#342) downloads the file again and calls `prepareFile` and `chunkPayload` to
 * get the chunk it is working on.
 */

export interface PreparedChunk {
  /** 0-based, as `ai_import_chunks.position`. */
  position: number;
  /** A PDF chunk's pages, 1-based and inclusive; null for text. */
  pageFrom: number | null;
  pageTo: number | null;
  /** A text chunk's markdown or text; null for a PDF chunk, whose pages are cut on demand. */
  text: string | null;
}

export interface PreparedFile {
  ok: true;
  kind: FileKind;
  sizeBytes: number;
  /** Hex SHA-256 of the bytes, as `ai_import_files.sha256`. */
  sha256: string;
  /** A PDF's pages; for text, an estimate from its length (about 3,000 characters a page). */
  pages: number;
  /** Pictures a .docx had, each now `[image]`. A PDF's are read by Claude, so 0. */
  images: number;
  chunks: PreparedChunk[];
}

export type Prepared = PreparedFile | Rejection;

export type ChunkPayload = { type: "pdf"; bytes: Uint8Array } | { type: "text"; text: string };

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

function textChunks(text: string): PreparedChunk[] {
  return chunkText(text).map((chunk, position) => ({
    position,
    pageFrom: null,
    pageTo: null,
    text: chunk,
  }));
}

async function preparePdf(
  bytes: Uint8Array,
): Promise<Omit<PreparedFile, "sizeBytes" | "sha256"> | Rejection> {
  const inspection = await inspectPdf(bytes);
  if (!inspection.ok) return inspection;
  const chunks = planPageChunks(inspection.pages).map((range, position) => ({
    position,
    ...range,
    text: null,
  }));
  return { ok: true, kind: "pdf", pages: inspection.pages, images: 0, chunks };
}

function prepareText(
  kind: FileKind,
  text: string,
  textChars: number,
  images: number,
): Omit<PreparedFile, "sizeBytes" | "sha256"> | Rejection {
  if (textChars === 0 || text.trim() === "") return reject("no_text");
  if (textChars > MAX_BATCH_PAGES * CHARS_PER_PAGE) return reject("too_many_pages");
  return {
    ok: true,
    kind,
    pages: estimatePages(textChars),
    images,
    chunks: textChunks(text),
  };
}

export async function prepareFile(bytes: Uint8Array, originalName: string): Promise<Prepared> {
  const sniffed = sniffFile(bytes, originalName);
  if (!sniffed.ok) return sniffed;

  let prepared: Omit<PreparedFile, "sizeBytes" | "sha256"> | Rejection;
  if (sniffed.kind === "pdf") {
    prepared = await preparePdf(bytes);
  } else if (sniffed.kind === "docx") {
    const docx = docxToMarkdown(bytes);
    if (!docx.ok) return docx;
    prepared = prepareText("docx", docx.markdown, docx.textChars, docx.images);
  } else {
    let text: string;
    try {
      text = decodeText(bytes);
    } catch {
      return reject("not_utf8");
    }
    prepared = prepareText(sniffed.kind, text, text.trim().length, 0);
  }
  if (!prepared.ok) return prepared;
  return { ...prepared, sizeBytes: bytes.length, sha256: sha256(bytes) };
}

/** What Claude is sent for chunk `position` of a prepared file: a PDF of its pages, or its text. */
export async function chunkPayload(
  bytes: Uint8Array,
  prepared: PreparedFile,
  position: number,
): Promise<ChunkPayload> {
  const chunk = prepared.chunks.find((c) => c.position === position);
  if (!chunk) throw new Error(`The file has no chunk ${position}.`);
  if (chunk.text !== null) return { type: "text", text: chunk.text };
  if (chunk.pageFrom === null || chunk.pageTo === null) {
    throw new Error(`Chunk ${position} has neither text nor pages.`);
  }
  return { type: "pdf", bytes: await extractPdfPages(bytes, chunk.pageFrom, chunk.pageTo) };
}
