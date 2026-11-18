import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { strToU8, zipSync, type Zippable } from "fflate";

/**
 * Fictional test documents for the file checks (#341), built in memory. Every word is written for
 * LeaRN's tests: no real patients, nothing from an instructor's documents.
 */

export const NOTICE =
  "Fictional content written for the LeaRN test corpus (#341). No real patients.";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NAMESPACES = [
  `xmlns:w="${W_NS}"`,
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(" ");

export const DOCX_MAIN =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
export const DOCM_MAIN = "application/vnd.ms-word.document.macroEnabled.main+xml";

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface RunOptions {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  highlight?: string;
  shading?: string;
  /** Font colour, as Word stores it: `C00000`, or `auto`. */
  colour?: string;
  strike?: boolean;
  doubleStrike?: boolean;
  vertical?: "superscript" | "subscript";
  /** `w:vanish`: hidden text. */
  hidden?: boolean;
  /** A character style's id (`Strong`). */
  style?: string;
  /** The run's font (`Symbol`, `Wingdings`). */
  font?: string;
}

/** One run of text with its formatting. */
export function run(text: string, options: RunOptions = {}): string {
  const props = [
    options.style ? `<w:rStyle w:val="${options.style}"/>` : "",
    options.font ? `<w:rFonts w:ascii="${options.font}" w:hAnsi="${options.font}"/>` : "",
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
    options.strike ? "<w:strike/>" : "",
    options.doubleStrike ? "<w:dstrike/>" : "",
    options.hidden ? "<w:vanish/>" : "",
    options.colour ? `<w:color w:val="${options.colour}"/>` : "",
    options.underline ? '<w:u w:val="single"/>' : "",
    options.highlight ? `<w:highlight w:val="${options.highlight}"/>` : "",
    options.shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.shading}"/>` : "",
    options.vertical ? `<w:vertAlign w:val="${options.vertical}"/>` : "",
  ].join("");
  const rPr = props ? `<w:rPr>${props}</w:rPr>` : "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

/** A character from Insert > Symbol: `<w:sym>` with its font and its code (`F0B3`). */
export const symbol = (font: string, char: string): string =>
  `<w:r><w:sym w:font="${font}" w:char="${char}"/></w:r>`;

/** A styles part: each style's id, its type, and the `<w:style>` contents after its name. */
export const styles = (
  entries: { id: string; type: "paragraph" | "character"; name?: string; body?: string }[],
): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W_NS}">${entries
    .map(
      (entry) =>
        `<w:style w:type="${entry.type}" w:styleId="${entry.id}"><w:name w:val="${entry.name ?? entry.id}"/>${entry.body ?? ""}</w:style>`,
    )
    .join("")}</w:styles>`;

/** A paragraph; a plain string is an unformatted run. */
export function para(...runs: string[]): string {
  return `<w:p>${runs.map((r) => (r.startsWith("<") ? r : run(r))).join("")}</w:p>`;
}

/** A paragraph with properties (`<w:pPr>` contents) before its runs. */
export function paraWith(pPr: string, ...runs: string[]): string {
  return `<w:p><w:pPr>${pPr}</w:pPr>${runs.map((r) => (r.startsWith("<") ? r : run(r))).join("")}</w:p>`;
}

/** A table: rows of cells, each cell a list of paragraphs (plain text or built) and an optional fill. */
export function table(rows: (string | { text: string; fill?: string; span?: number })[][]): string {
  const cell = (c: string | { text: string; fill?: string; span?: number }): string => {
    const { text, fill, span } = typeof c === "string" ? { text: c } : c;
    const props = [
      span ? `<w:gridSpan w:val="${span}"/>` : "",
      fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : "",
    ].join("");
    const body = text.startsWith("<w:p") ? text : para(text);
    return `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ""}${body}</w:tc>`;
  };
  return `<w:tbl>${rows.map((row) => `<w:tr>${row.map(cell).join("")}</w:tr>`).join("")}</w:tbl>`;
}

/** A floating text box, written as Word writes one: DrawingML first, VML as the fallback. */
export function textBox(text: string): string {
  const content = `<w:txbxContent>${para(text)}</w:txbxContent>`;
  return (
    "<w:r><mc:AlternateContent>" +
    `<mc:Choice Requires="wps"><w:drawing><wp:anchor><a:graphic><a:graphicData><wps:wsp><wps:txbx>${content}</wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>` +
    `<mc:Fallback><w:pict><v:shape><v:textbox>${content}</v:textbox></v:shape></w:pict></mc:Fallback>` +
    "</mc:AlternateContent></w:r>"
  );
}

/** An inline picture. */
export const image = (): string =>
  '<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId9"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';

export const document = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NAMESPACES}><w:body>${body}</w:body></w:document>`;

export const numbering = (abstractNums: string, nums: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W_NS}">${abstractNums}${nums}</w:numbering>`;

interface DocxOptions {
  body: string;
  numbering?: string;
  styles?: string;
  mainType?: string;
  extra?: Record<string, Uint8Array | string>;
  /** Overrides the whole `word/document.xml`, for malformed XML. */
  documentXml?: string;
  level?: 0 | 9;
  /** The main document's entry name, when it is not `word/document.xml` (#592). */
  mainPart?: string;
}

/** A minimal WordprocessingML package. */
export function buildDocx(options: DocxOptions): Uint8Array {
  const mainPart = options.mainPart ?? "word/document.xml";
  const overrides = [
    `<Override PartName="/${mainPart}" ContentType="${options.mainType ?? DOCX_MAIN}"/>`,
  ];
  const files: Zippable = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        overrides.join("") +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="' +
        mainPart +
        '"/></Relationships>',
    ),
    [mainPart]: strToU8(options.documentXml ?? document(options.body)),
  };
  if (options.numbering) files["word/numbering.xml"] = strToU8(options.numbering);
  if (options.styles) files["word/styles.xml"] = strToU8(options.styles);
  for (const [name, value] of Object.entries(options.extra ?? {})) {
    files[name] = typeof value === "string" ? strToU8(value) : value;
  }
  return zipSync(files, { level: options.level ?? 9 });
}

/**
 * A PDF of `pages` pages. Page n is 200 + n points wide and prints its number, so a chunk's pages
 * can be told apart.
 */
export async function buildPdf(pages: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= pages; n += 1) {
    const page = pdf.addPage([200 + n, 300]);
    page.drawText(`Page ${n}. ${n === 1 ? NOTICE.slice(0, 40) : ""}`, {
      x: 20,
      y: 250,
      size: 10,
      font,
    });
  }
  return pdf.save();
}

/** A PDF that opens only with a password. */
export async function buildEncryptedPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 300]);
  pdf.encrypt({ userPassword: "fictional", ownerPassword: "fictional-owner" });
  return pdf.save();
}

/**
 * A PDF that opens with no password but carries an owner password and permissions (no copying,
 * no editing), as publishers' and scanners' PDFs often do (#592). Its content is still encrypted.
 */
export async function buildPermissionsPdf(pages = 3): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await buildPdf(pages));
  pdf.encrypt({
    userPassword: "",
    ownerPassword: "fictional-owner",
    permissions: { copying: false, modifying: false },
  });
  return pdf.save();
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
