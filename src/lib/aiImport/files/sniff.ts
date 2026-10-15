import { MAX_FILE_BYTES } from "./limits";
import { reject, type Rejection } from "./reasons";
import { partText, readZip } from "./zip";

/**
 * What a file is, read from its bytes (#341). The name is consulted only to tell Markdown from
 * plain text, which no bytes can, and to refuse text that claims to be something else. A PDF
 * called quiz.docx is a PDF.
 */

export type FileKind = "pdf" | "docx" | "md" | "txt";

export type Sniffed = { ok: true; kind: FileKind } | Rejection;

const CONTENT_TYPES = "[Content_Types].xml";
const DOCUMENT_PART = "word/document.xml";
const DOCX_MAIN =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const MACRO_MAIN = "application/vnd.ms-word.document.macroEnabled.main+xml";
const CONTENT_TYPES_MAX = 512 * 1024;

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean =>
  signature.every((byte, i) => bytes[at + i] === byte);

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK\3\4
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .doc, and an encrypted .docx
const UTF16_LE = [0xff, 0xfe];
const UTF16_BE = [0xfe, 0xff];
const UTF8_BOM = [0xef, 0xbb, 0xbf];
const RTF = [0x7b, 0x5c, 0x72, 0x74, 0x66]; // {\rtf

/** A PDF's header may follow a little junk; the spec allows it within the first 1024 bytes. */
const PDF_HEADER_WINDOW = 1024;

function isPdf(bytes: Uint8Array): boolean {
  const window = bytes.subarray(0, Math.min(bytes.length, PDF_HEADER_WINDOW));
  for (let i = 0; i + PDF.length <= window.length; i += 1) {
    if (startsWith(window, PDF, i)) return true;
  }
  return false;
}

function sniffZip(bytes: Uint8Array): Sniffed {
  const zip = readZip(bytes, { [CONTENT_TYPES]: CONTENT_TYPES_MAX });
  if (!zip.ok) return reject(zip.code === "too_complex" ? "too_complex" : "corrupt");
  const lower = zip.names.map((name) => name.toLowerCase());
  if (lower.some((name) => name.endsWith("vbaproject.bin"))) return reject("macro_enabled");
  const types = partText(zip.parts, CONTENT_TYPES);
  if (types === null) return reject("unsupported");
  if (types.includes(MACRO_MAIN)) return reject("macro_enabled");
  if (!types.includes(DOCX_MAIN) || !zip.names.includes(DOCUMENT_PART)) {
    return reject("unsupported");
  }
  return { ok: true, kind: "docx" };
}

function textKind(name: string): FileKind | null {
  const extension = /\.([^./\\]+)$/.exec(name.trim())?.[1]?.toLowerCase();
  if (extension === "md" || extension === "markdown") return "md";
  if (extension === "txt" || extension === undefined) return "txt";
  return null;
}

/** UTF-8 text with no NUL and few control characters; a BOM is allowed. */
function sniffText(bytes: Uint8Array, name: string): Sniffed {
  if (startsWith(bytes, UTF16_LE) || startsWith(bytes, UTF16_BE)) return reject("not_utf8");
  const body = startsWith(bytes, UTF8_BOM) ? bytes.subarray(UTF8_BOM.length) : bytes;
  if (startsWith(body, RTF)) return reject("unsupported");
  if (looksBinary(body)) return reject("unsupported");
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return reject("not_utf8");
  }
  const kind = textKind(name);
  return kind ? { ok: true, kind } : reject("unsupported");
}

/** A NUL in the first 8 KB, or more than 1 in 10 control characters, is a binary file. */
function looksBinary(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 8192);
  let control = 0;
  for (const byte of head) {
    if (byte === 0) return true;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) control += 1;
  }
  return control * 10 > head.length;
}

export function sniffFile(bytes: Uint8Array, originalName: string): Sniffed {
  if (bytes.length === 0) return reject("empty");
  if (bytes.length > MAX_FILE_BYTES) return reject("too_large");
  // Fixed signatures at offset 0 first; a PDF's header may sit a little later.
  if (startsWith(bytes, ZIP)) return sniffZip(bytes);
  if (startsWith(bytes, OLE)) return reject("legacy_doc");
  if (isPdf(bytes)) return { ok: true, kind: "pdf" };
  return sniffText(bytes, originalName);
}
