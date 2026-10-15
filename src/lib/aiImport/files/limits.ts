/**
 * The limits on what AI import accepts (ADR 0008, #341). The database holds the same batch limits
 * (#340: 5 files, 100 pages, 150 questions, 25 MB per object); these are checked first so a
 * teacher gets a named reason, not a constraint error.
 */

/** Files in one batch. */
export const MAX_FILES_PER_BATCH = 5;
/** Bytes in one file: 25 MB, as the `ai-imports` bucket and `ai_import_files.size_bytes` allow. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Pages in one batch, across its files. A .docx, .md or .txt counts its estimated pages. */
export const MAX_BATCH_PAGES = 100;

/** A PDF is sent to Claude about 8 pages at a time... */
export const PDF_CHUNK_PAGES = 8;
/** ...each chunk repeating the last page of the one before, so a question across a break is whole. */
export const PDF_CHUNK_OVERLAP = 1;

/**
 * Characters of plain text counted as one page, for a file with no pages of its own. A dense
 * printed page of a quiz holds about 3,000.
 */
export const CHARS_PER_PAGE = 3000;
/** A text chunk aims for about 8 pages of characters, ending at a heading or a blank line. */
export const TEXT_CHUNK_TARGET_CHARS = PDF_CHUNK_PAGES * CHARS_PER_PAGE;
/** No text chunk is longer than this; one block longer than it is cut at a line, then anywhere. */
export const TEXT_CHUNK_MAX_CHARS = 32_000;

/**
 * A .docx is a zip, so its bytes may expand far past 25 MB. Only the parts the converter reads are
 * inflated, each up to its declared size, and these bound the declared sizes.
 */
export const DOCX_MAX_ENTRIES = 5000;
/** The uncompressed size of `word/document.xml`. */
export const DOCX_MAX_DOCUMENT_XML_BYTES = 8 * 1024 * 1024;
/** Any other part the converter reads (numbering, styles, content types). */
export const DOCX_MAX_PART_BYTES = 8 * 1024 * 1024;
/** All the parts it reads together. */
export const DOCX_MAX_TOTAL_BYTES = 16 * 1024 * 1024;
/** Uncompressed over compressed for one part. Real Word XML compresses about 10 to 1. */
export const DOCX_MAX_RATIO = 200;
/** How deep an XML element may sit. Word nests a table in a table in a text box, not 200 deep. */
export const DOCX_MAX_DEPTH = 200;
/**
 * Tags in one Word part. Parsing costs memory by the element, not the byte: 16 MB of empty runs
 * took 2.5 GB. A 100-page quiz has well under 100,000.
 */
export const DOCX_MAX_ELEMENTS = 250_000;
/**
 * Bytes a PDF's object and cross-reference streams may decode to, all together. They hold the
 * PDF's objects, not its pictures, and a real 100-page PDF needs a few megabytes.
 */
export const PDF_MAX_DECODED_BYTES = 64 * 1024 * 1024;
