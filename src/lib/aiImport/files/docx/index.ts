import { DOCX_MAX_DOCUMENT_XML_BYTES, DOCX_MAX_PART_BYTES } from "../limits";
import { reject, type Rejection } from "../reasons";
import { partText, readZip } from "../zip";
import { Converter, TooDeep } from "./convert";
import { Numbering, readStyles } from "./numbering";
import { XmlTooLarge, child, parseXml, type Document } from "./xml";

/**
 * A .docx to markdown (#341). See `Converter` for what is kept, and `DOCX_MARKUP` for the
 * markup Claude is told about.
 */

export type DocxMarkdown =
  | {
      ok: true;
      markdown: string;
      /** Pictures replaced by `[image]`; a question that relies on one is flagged later (#343). */
      images: number;
      /** Characters of text without markup, for the page estimate. */
      textChars: number;
    }
  | Rejection;

const DOCUMENT = "word/document.xml";
const NUMBERING = "word/numbering.xml";
const STYLES = "word/styles.xml";

/** How the markdown marks Word formatting, for the prompt that reads it (#342). */
export const DOCX_MARKUP = [
  "This document was converted from Word. Its formatting is marked like this:",
  "**bold**, *italic*, <u>underlined</u>;",
  "==highlighted text=={colour}, where colour is Word's highlight name (yellow) or a shading fill (#FFFF00);",
  "a table cell that starts {shaded #RRGGBB} has that background colour;",
  "list numbers and letters are written as Word shows them;",
  "[text box] ... [/text box] holds the text of a floating text box;",
  "[image] is a picture that could not be read.",
].join("\n");

function optionalPart(parts: Map<string, Uint8Array>, name: string): Document | null {
  if (!parts.has(name)) return null;
  const text = partText(parts, name);
  if (text === null) throw new Error(`${name} is not UTF-8`);
  return parseXml(text);
}

export function docxToMarkdown(bytes: Uint8Array): DocxMarkdown {
  const zip = readZip(bytes, {
    [DOCUMENT]: DOCX_MAX_DOCUMENT_XML_BYTES,
    [NUMBERING]: DOCX_MAX_PART_BYTES,
    [STYLES]: DOCX_MAX_PART_BYTES,
  });
  if (!zip.ok) return reject(zip.code);
  const documentText = partText(zip.parts, DOCUMENT);
  if (documentText === null) return reject("corrupt");

  try {
    const doc = parseXml(documentText);
    const body = child(doc.documentElement ?? undefined, "body");
    if (!body) return reject("corrupt");
    const converter = new Converter(
      new Numbering(optionalPart(zip.parts, NUMBERING)),
      readStyles(optionalPart(zip.parts, STYLES)),
    );
    const markdown = converter.render(body);
    return { ok: true, markdown, images: converter.images, textChars: converter.textChars };
  } catch (error) {
    // A stack overflow is a document nested deeper than the converter's own limit caught.
    if (error instanceof TooDeep || error instanceof XmlTooLarge || error instanceof RangeError) {
      return reject("too_complex");
    }
    return reject("corrupt");
  }
}
