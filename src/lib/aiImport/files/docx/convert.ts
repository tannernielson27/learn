import { DOCX_MAX_DEPTH } from "../limits";
import { headingLevel, type Numbering, type StyleInfo } from "./numbering";
import { attr, child, elements, toggle, type Element } from "./xml";

/**
 * WordprocessingML to the markdown Claude reads (#341, ADR 0008 Pipeline step 2). Keys hide in
 * formatting, so formatting is kept as markup (see `DOCX_MARKUP`): bold, italic, underline,
 * highlight with its colour, table cells with their shading, list numbers as Word shows them,
 * text boxes, and the final view of tracked changes. Comments are dropped and each picture
 * becomes `[image]`. Text is copied as it is, `*` keys included; nothing is escaped but a `|`
 * inside a table cell.
 */

/** Thrown when the XML nests deeper than `DOCX_MAX_DEPTH`. */
export class TooDeep extends Error {}

interface Format {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** A highlight colour name (`yellow`), or a run shading fill (`#FFFF00`). */
  highlight: string | null;
}

type Piece = { kind: "text"; text: string; format: Format } | { kind: "image" };

interface Block {
  text: string;
  list: boolean;
}

const PLAIN: Format = { bold: false, italic: false, underline: false, highlight: null };

/** Elements that hold nothing a reader sees, or text that is not in the final view. */
const SKIPPED = new Set([
  "del",
  "moveFrom",
  "delText",
  "delInstrText",
  "instrText",
  "pPr",
  "rPr",
  "tcPr",
  "trPr",
  "tblPr",
  "tblGrid",
  "sectPr",
  "sdtPr",
  "sdtEndPr",
  "customXmlPr",
  "smartTagPr",
  "rPrChange",
  "pPrChange",
  "commentRangeStart",
  "commentRangeEnd",
  "commentReference",
  "annotationRef",
  "footnoteReference",
  "endnoteReference",
  "fldChar",
  "bookmarkStart",
  "bookmarkEnd",
  "proofErr",
  "lastRenderedPageBreak",
]);

const GRAPHICS = new Set(["drawing", "pict", "object"]);

/** Common Wingdings and Symbol characters used to mark keys. */
const SYMBOLS: Record<string, string> = {
  F0FC: "✓",
  F0FB: "✗",
  F0FD: "☒",
  F0FE: "☑",
  F0A8: "☐",
  F06F: "☐",
  F0B7: "•",
  F0D6: "✓",
};

const COLOUR_NAME = /^[A-Za-z]{1,20}$/;
const HEX = /^[0-9A-Fa-f]{6}$/;

function fill(shd: Element | undefined): string | null {
  const value = attr(shd, "fill");
  if (!value || !HEX.test(value) || value.toUpperCase() === "FFFFFF") return null;
  return `#${value.toUpperCase()}`;
}

function runFormat(rPr: Element | undefined): Format {
  if (!rPr) return PLAIN;
  const named = attr(child(rPr, "highlight"), "val");
  const highlight =
    named && named.toLowerCase() !== "none" && COLOUR_NAME.test(named)
      ? named
      : fill(child(rPr, "shd"));
  return {
    bold: toggle(child(rPr, "b")),
    italic: toggle(child(rPr, "i")),
    underline: toggle(child(rPr, "u")),
    highlight,
  };
}

/** Wraps `text` in markers, leaving its outer whitespace outside them. */
function wrap(text: string, open: string, close: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) as RegExpExecArray;
  const [, lead, core, trail] = match;
  return core ? `${lead}${open}${core}${close}${trail}` : text;
}

function renderInner(pieces: { text: string; format: Format }[]): string {
  let out = "";
  let i = 0;
  while (i < pieces.length) {
    const { format } = pieces[i];
    let text = "";
    while (
      i < pieces.length &&
      pieces[i].format.bold === format.bold &&
      pieces[i].format.italic === format.italic &&
      pieces[i].format.underline === format.underline
    ) {
      text += pieces[i].text;
      i += 1;
    }
    if (format.underline) text = wrap(text, "<u>", "</u>");
    if (format.italic) text = wrap(text, "*", "*");
    if (format.bold) text = wrap(text, "**", "**");
    out += text;
  }
  return out;
}

function renderPieces(pieces: Piece[]): string {
  let out = "";
  let i = 0;
  while (i < pieces.length) {
    const piece = pieces[i];
    if (piece.kind === "image") {
      out += "[image]";
      i += 1;
      continue;
    }
    const group: { text: string; format: Format }[] = [];
    while (i < pieces.length) {
      const next = pieces[i];
      if (next.kind !== "text" || next.format.highlight !== piece.format.highlight) break;
      group.push(next);
      i += 1;
    }
    const inner = renderInner(group);
    out += piece.format.highlight ? wrap(inner, "==", `=={${piece.format.highlight}}`) : inner;
  }
  return out;
}

function chooseBranch(alternate: Element): Element | undefined {
  return child(alternate, "Choice") ?? child(alternate, "Fallback");
}

/** The text boxes in a graphic, not looking inside a VML fallback (it repeats the DrawingML). */
function textBoxesIn(graphic: Element): Element[] {
  const found: Element[] = [];
  const stack = [graphic];
  while (stack.length > 0) {
    const el = stack.pop() as Element;
    for (const next of elements(el)) {
      if (next.localName === "txbxContent") found.push(next);
      else if (next.localName !== "Fallback") stack.push(next);
    }
  }
  return found.reverse();
}

export class Converter {
  images = 0;
  textChars = 0;

  constructor(
    private readonly numbering: Numbering,
    private readonly styles: Map<string, StyleInfo>,
  ) {}

  /** The markdown of `<w:body>` or any other block container. */
  render(container: Element): string {
    return this.join(this.blocks(container, 0));
  }

  private join(blocks: Block[]): string {
    let out = "";
    blocks.forEach((block, index) => {
      if (index > 0) out += block.list && blocks[index - 1].list ? "\n" : "\n\n";
      out += block.text;
    });
    return out;
  }

  private enter(depth: number): number {
    if (depth > DOCX_MAX_DEPTH) throw new TooDeep();
    return depth + 1;
  }

  private blocks(container: Element, depth: number): Block[] {
    const inner = this.enter(depth);
    const out: Block[] = [];
    for (const el of elements(container)) {
      const name = el.localName ?? "";
      if (SKIPPED.has(name)) continue;
      if (name === "p") out.push(...this.paragraph(el, inner));
      else if (name === "tbl") {
        const table = this.table(el, inner);
        if (table) out.push({ text: table, list: false });
      } else if (name === "AlternateContent") {
        const branch = chooseBranch(el);
        if (branch) out.push(...this.blocks(branch, inner));
      } else {
        // sdt, sdtContent, customXml, ins, moveTo: containers whose content is in the final view.
        out.push(...this.blocks(el, inner));
      }
    }
    return out;
  }

  private paragraph(p: Element, depth: number): Block[] {
    const pPr = child(p, "pPr");
    const styleId = attr(child(pPr, "pStyle"), "val");
    const style = styleId ? this.styles.get(styleId) : undefined;
    const numPr = child(pPr, "numPr");
    const numId = attr(child(numPr, "numId"), "val") ?? style?.numId ?? null;
    const ilvlText = attr(child(numPr, "ilvl"), "val");
    const ilvl = ilvlText && /^\d$/.test(ilvlText) ? Number(ilvlText) : (style?.ilvl ?? 0);

    const pieces: Piece[] = [];
    const boxes: string[] = [];
    for (const el of elements(p)) this.inline(el, PLAIN, pieces, boxes, depth);

    const text = renderPieces(pieces).trim();
    const label = numId ? this.numbering.next(numId, ilvl) : null;
    const heading = headingLevel(styleId, this.styles);
    const out: Block[] = [];
    if (text) {
      if (label) out.push({ text: `${"  ".repeat(ilvl)}${label} ${text}`, list: true });
      else if (heading) out.push({ text: `${"#".repeat(heading)} ${text}`, list: false });
      else out.push({ text, list: false });
    }
    for (const box of boxes) out.push({ text: `[text box]\n${box}\n[/text box]`, list: false });
    return out;
  }

  private text(text: string, format: Format, pieces: Piece[]): void {
    if (!text) return;
    this.textChars += text.length;
    pieces.push({ kind: "text", text, format });
  }

  private inline(el: Element, format: Format, pieces: Piece[], boxes: string[], depth: number) {
    const inner = this.enter(depth);
    const name = el.localName ?? "";
    if (SKIPPED.has(name)) return;
    switch (name) {
      case "r": {
        const runFmt = runFormat(child(el, "rPr"));
        for (const part of elements(el)) this.inline(part, runFmt, pieces, boxes, inner);
        return;
      }
      case "t":
        this.text(el.textContent ?? "", format, pieces);
        return;
      case "tab":
      case "ptab":
        this.text("\t", format, pieces);
        return;
      case "br":
      case "cr":
        this.text("\n", format, pieces);
        return;
      case "noBreakHyphen":
        this.text("-", format, pieces);
        return;
      case "softHyphen":
        return;
      case "sym": {
        const code = (attr(el, "char") ?? "").toUpperCase();
        this.text(SYMBOLS[code] ?? "[symbol]", format, pieces);
        return;
      }
      case "AlternateContent": {
        const branch = chooseBranch(el);
        if (branch) {
          for (const part of elements(branch)) this.inline(part, format, pieces, boxes, inner);
        }
        return;
      }
      default:
        if (GRAPHICS.has(name)) {
          this.graphic(el, pieces, boxes, inner);
          return;
        }
        // ins, moveTo, hyperlink, smartTag, customXml, sdt, sdtContent, fldSimple, math.
        for (const part of elements(el)) this.inline(part, format, pieces, boxes, inner);
    }
  }

  private graphic(el: Element, pieces: Piece[], boxes: string[], depth: number): void {
    const found = textBoxesIn(el);
    if (found.length === 0) {
      this.images += 1;
      pieces.push({ kind: "image" });
      return;
    }
    for (const box of found) {
      const markdown = this.join(this.blocks(box, depth));
      if (markdown) boxes.push(markdown);
    }
  }

  private table(tbl: Element, depth: number): string {
    const rows: string[][] = [];
    for (const tr of this.containedIn(tbl, "tr", depth)) {
      if (child(child(tr, "trPr"), "del")) continue;
      const cells: string[] = [];
      for (const tc of this.containedIn(tr, "tc", depth)) {
        const tcPr = child(tc, "tcPr");
        const span = Number(attr(child(tcPr, "gridSpan"), "val") ?? "1");
        const vMerge = child(tcPr, "vMerge");
        const continued = vMerge !== undefined && attr(vMerge, "val") !== "restart";
        cells.push(continued ? "" : this.cell(tc, tcPr, depth));
        for (let extra = 1; extra < Math.min(Number.isInteger(span) ? span : 1, 64); extra += 1) {
          cells.push("");
        }
      }
      rows.push(cells);
    }
    if (rows.length === 0) return "";
    const width = Math.max(...rows.map((row) => row.length));
    const line = (row: string[]) =>
      `| ${Array.from({ length: width }, (_, i) => row[i] ?? "").join(" | ")} |`;
    const separator = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
    return [line(rows[0]), separator, ...rows.slice(1).map(line)].join("\n");
  }

  /** Rows of a table or cells of a row, looking through content controls and custom XML. */
  private containedIn(parent: Element, name: string, depth: number): Element[] {
    const inner = this.enter(depth);
    const out: Element[] = [];
    for (const el of elements(parent)) {
      if (el.localName === name) out.push(el);
      else if (!SKIPPED.has(el.localName ?? "")) out.push(...this.containedIn(el, name, inner));
    }
    return out;
  }

  private cell(tc: Element, tcPr: Element | undefined, depth: number): string {
    const text = this.blocks(tc, depth)
      .map((block) => block.text)
      .join("<br>")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, "<br>")
      .replace(/\t/g, " ");
    // A shaded cell with no text is kept too: shading alone can mark a key.
    const shading = fill(child(tcPr, "shd"));
    if (!shading) return text;
    return text ? `{shaded ${shading}} ${text}` : `{shaded ${shading}}`;
  }
}
