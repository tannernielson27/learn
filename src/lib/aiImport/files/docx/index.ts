import { DOCX_MAX_DOCUMENT_XML_BYTES, DOCX_MAX_PART_BYTES, DOCX_MAX_RELS_BYTES } from "../limits";
import { reject, type Rejection } from "../reasons";
import { partText, readZip } from "../zip";
import { Converter, TooDeep } from "./convert";
import { Numbering, readStyles } from "./numbering";
import { PACKAGE_RELS, mainPartName, siblingPart } from "./package";
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

/**
 * How the markdown marks Word formatting, for the prompt that reads it (#342, #592). Every mark
 * the converter writes is named here, and `sourceText.ts` ignores every one of them when it
 * checks what the model copied. The last two lines say when formatting is the document's answer
 * mark: an author who makes some of the options bold or red has marked them, and the draft
 * carries that mark as a `*`. They are written to say no more than `choiceMarks.ts` accepts:
 * the model is told what the guard will believe, and nothing wider.
 */
export const DOCX_MARKUP = [
  "This document was converted from Word. Its formatting is marked like this:",
  "**bold**, *italic*, <u>underlined</u>;",
  "~~struck through~~ text was crossed out by the author and is not part of the question;",
  "==highlighted text=={colour}, where colour is Word's highlight name (yellow) or a shading fill (#FFFF00);",
  "==coloured text=={color #RRGGBB} is in that font colour, and {yellow, color #RRGGBB} is both highlighted and coloured;",
  "a table cell, paragraph or list item that starts {shaded #RRGGBB} has that background colour;",
  "raised and lowered text is written with superscript and subscript characters (10³, SpO₂), or as ^(text) and _(text);",
  "list numbers and letters are written as Word shows them;",
  "[text box] ... [/text box] holds the text of a floating text box;",
  "[image] is a picture that could not be read, and [symbol] a character that could not be.",
  "When some of a question's choices (options, list items, table rows or cells) are bold, underlined, coloured, shaded or highlighted as a whole and its other choices are not, that formatting is the document's answer mark: write * on those choices in the draft.",
  "Emphasis in a stem, a label, a heading or a table header is never an answer mark, and neither is formatting that every choice shares.",
].join("\n");

function optionalPart(parts: Map<string, Uint8Array>, name: string): Document | null {
  if (!parts.has(name)) return null;
  const text = partText(parts, name);
  if (text === null) throw new Error(`${name} is not UTF-8`);
  return parseXml(text);
}

export function docxToMarkdown(bytes: Uint8Array): DocxMarkdown {
  // The package says where its main document is; only then is it known which parts to inflate.
  const index = readZip(bytes, { [PACKAGE_RELS]: DOCX_MAX_RELS_BYTES });
  if (!index.ok) return reject(index.code);
  const main = mainPartName(partText(index.parts, PACKAGE_RELS), index.names);
  if (main === null) return reject("corrupt");
  const numberingPart = siblingPart(main, "numbering.xml");
  const stylesPart = siblingPart(main, "styles.xml");
  const zip = readZip(bytes, {
    [numberingPart]: DOCX_MAX_PART_BYTES,
    [stylesPart]: DOCX_MAX_PART_BYTES,
    [main]: DOCX_MAX_DOCUMENT_XML_BYTES,
  });
  if (!zip.ok) return reject(zip.code);
  const documentText = partText(zip.parts, main);
  if (documentText === null) return reject("corrupt");

  try {
    const doc = parseXml(documentText);
    const body = child(doc.documentElement ?? undefined, "body");
    if (!body) return reject("corrupt");
    const converter = new Converter(
      new Numbering(optionalPart(zip.parts, numberingPart)),
      readStyles(optionalPart(zip.parts, stylesPart)),
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
