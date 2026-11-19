import { strToU8, zipSync, type Zippable } from "fflate";
import { document } from "@/lib/aiImport/files/testing/fixtures";

/**
 * The file formats the real-size corpus is written in (#594): a Word package and a text PDF, each
 * built the way `build.py` builds the smaller ones, so the same bytes come out on every machine
 * and a test can hold the committed files to them.
 */

export const NOTICE =
  "Fictional content written for the LeaRN test corpus (#594). No real patients.";

/**
 * A .docx from its body XML. Stored without compression, so the notice can be read in its bytes,
 * and with a fixed date, so the bytes do not change from one run to the next.
 */
export function writeDocx(body: string): Uint8Array {
  const files: Zippable = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>",
    ),
    "word/document.xml": strToU8(document(body)),
  };
  // The date is given in local time, as the zip format stores it, so every time zone writes it
  // the same.
  return zipSync(files, { level: 0, mtime: new Date(1980, 0, 1) });
}

/** One line of a PDF page. */
export interface PdfLine {
  text: string;
  bold?: boolean;
  size?: number;
  /** How far the next line sits below this one, in points. */
  gap?: number;
}

export const PDF_LINE_GAP = 13;
const PAGE_TOP = 740;
const PAGE_BOTTOM = 60;
const MARGIN_LEFT = 54;

/** How much text fits down one page, in points: what a layout may spend on its lines' gaps. */
export const PDF_PAGE_ROOM = PAGE_TOP - PAGE_BOTTOM;

const escapePdf = (text: string): string =>
  text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Text as the PDF's WinAnsi fonts read it: one byte for each character. */
const bytesOf = (text: string): Buffer => Buffer.from(text, "latin1");

function pageContent(lines: readonly PdfLine[]): Buffer {
  let y = PAGE_TOP;
  const ops = lines.map((line) => {
    const op = `BT ${line.bold ? "/F2" : "/F1"} ${line.size ?? 10} Tf ${MARGIN_LEFT}.0 ${y.toFixed(1)} Td (${escapePdf(line.text)}) Tj ET`;
    y -= line.gap ?? PDF_LINE_GAP;
    return op;
  });
  return bytesOf(ops.join("\n"));
}

/**
 * A text PDF of `pages`, each a list of lines set from the top down: PDF 1.4 written by hand with
 * its content streams left uncompressed, as `build.py` writes the two-column handout.
 */
export function writePdf(pages: readonly (readonly PdfLine[])[], title: string): Uint8Array {
  const objects: Buffer[] = [];
  const add = (body: Buffer | string): number =>
    objects.push(typeof body === "string" ? bytesOf(body) : body);

  const catalog = add("");
  const pagesId = add("");
  const font = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const boldFont = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  const kids = pages.map((lines) => {
    const content = pageContent(lines);
    const stream = add(
      Buffer.concat([
        bytesOf(`<< /Length ${content.length} >>\nstream\n`),
        content,
        bytesOf("\nendstream"),
      ]),
    );
    return add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${font} 0 R /F2 ${boldFont} 0 R >> >> /Contents ${stream} 0 R >>`,
    );
  });
  objects[catalog - 1] = bytesOf(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  objects[pagesId - 1] = bytesOf(
    `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`,
  );
  const info = add(`<< /Title (${escapePdf(title)}) /Subject (${escapePdf(NOTICE)}) >>`);

  const parts: Buffer[] = [bytesOf("%PDF-1.4\n%âãÏÓ\n")];
  let offset = parts[0].length;
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    const object = Buffer.concat([bytesOf(`${index + 1} 0 obj\n`), body, bytesOf("\nendobj\n")]);
    offsets.push(offset);
    offset += object.length;
    parts.push(object);
  });
  const entries = offsets.map((at) => `${String(at).padStart(10, "0")} 00000 n \n`).join("");
  parts.push(
    bytesOf(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}` +
        `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\n` +
        `startxref\n${offset}\n%%EOF\n`,
    ),
  );
  return new Uint8Array(Buffer.concat(parts));
}

/** `text` broken into lines of at most `width` characters, at its spaces. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line !== "" && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}
