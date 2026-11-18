/**
 * The marks a document's text arrives with (#593). A Word file is converted to text with its
 * formatting written as marks (`src/lib/aiImport/files/docx/format.ts`): `**bold**`,
 * `<u>underlined</u>`, `~~struck out~~`, `==highlighted=={yellow}`, `==coloured=={color #C00000}`,
 * `{shaded #D9D9D9}` at the start of a shaded line or cell, and `<br>` between a cell's
 * paragraphs. A teacher checks a key against this text, and the key is often one of those marks,
 * so the review shows them as formatting rather than as punctuation.
 *
 * This only reads text into a tree. It is drawn with React elements, never as HTML, so nothing
 * a document holds can become markup. A mark that is not closed stays as the text it is. Imported
 * by a Client Component: nothing from `src/lib/aiImport` here.
 *
 * The text is a teacher's document, so its shape is not ours to trust. It is read one line at a
 * time (no mark spans a line), in one pass: an opening mark looks for its closing mark once, and
 * a kind of mark that has no closing mark left on the line is not looked for again. A line of
 * thousands of unclosed `<u>` is read as fast as a line of plain words.
 */

export type SourceMark = "bold" | "underline" | "struck" | "highlight" | "coloured";

export type SourceNode =
  | { kind: "text"; text: string }
  | { kind: SourceMark; children: SourceNode[] }
  | { kind: "break" }
  | { kind: "shaded" };

/** Where a mark may start. Each alternative is a fixed token, so the scan never backtracks. */
const OPENER = /<br\s*\/?>|\{shaded\s+#[0-9A-Fa-f]{6}\}|==|\*\*|<u>|~~/gi;
/** What follows a highlighted or coloured stretch: `{yellow}`, `{color #C00000}`. */
const SPEC = /\{([^{}\n]{1,40})\}/y;
/** Marks inside marks are read this deep; deeper ones stay as text. */
const MAX_DEPTH = 6;

type Paired = "bold" | "underline" | "struck" | "marked";

const CLOSERS: Record<Paired, string> = {
  bold: "**",
  underline: "</u>",
  struck: "~~",
  marked: "==",
};

function pairedOf(token: string): Paired {
  if (token === "**") return "bold";
  if (token === "~~") return "struck";
  return token === "==" ? "marked" : "underline";
}

/**
 * Where `kind`'s closing mark next stands, or -1. The underline tag is looked for in both cases
 * on the line itself: lower-casing a line can change its length, and with it every index.
 */
function closeOf(line: string, kind: Paired, from: number): number {
  const close = line.indexOf(CLOSERS[kind], from);
  if (kind !== "underline") return close;
  const upper = line.indexOf("</U>", from);
  if (close < 0 || upper < 0) return Math.max(close, upper);
  return Math.min(close, upper);
}

/** `==inner=={spec}`: a highlight, font colour, or both. */
function markedNode(inner: SourceNode[], spec: string): SourceNode {
  const named = spec.trim().toLowerCase();
  // `{color #C00000}` is font colour alone; `{yellow, color #C00000}` is a highlight as well.
  if (named.startsWith("color")) return { kind: "coloured", children: inner };
  return {
    kind: "highlight",
    children: named.includes("color") ? [{ kind: "coloured", children: inner }] : inner,
  };
}

/** One line as plain text and marks, in order. */
function parseLine(line: string, depth: number): SourceNode[] {
  const nodes: SourceNode[] = [];
  // A kind with no closing mark from here on has none further along either.
  const unclosed = new Set<Paired>();
  const pattern = new RegExp(OPENER.source, OPENER.flags);
  let from = 0;
  const textUpTo = (end: number) => {
    if (end > from) nodes.push({ kind: "text", text: line.slice(from, end) });
  };

  for (let match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
    const token = match[0];
    const at = match.index;
    if (token.startsWith("<b") || token.startsWith("<B") || token.startsWith("{")) {
      textUpTo(at);
      nodes.push(token.startsWith("{") ? { kind: "shaded" } : { kind: "break" });
      from = pattern.lastIndex;
      continue;
    }
    const kind = pairedOf(token.toLowerCase());
    if (unclosed.has(kind) || depth >= MAX_DEPTH) continue;
    const open = at + token.length;
    const close = closeOf(line, kind, open);
    if (close < 0) {
      unclosed.add(kind);
      continue;
    }
    const inner = line.slice(open, close);
    let end = close + CLOSERS[kind].length;
    let node: SourceNode | null = null;
    if (kind === "underline") {
      node = { kind, children: parseLine(inner, depth + 1) };
    } else if (kind === "bold" && inner !== "") {
      node = { kind, children: parseLine(inner, depth + 1) };
    } else if (kind === "struck" && inner !== "" && !inner.includes("~")) {
      node = { kind, children: parseLine(inner, depth + 1) };
    } else if (kind === "marked" && inner !== "") {
      SPEC.lastIndex = end;
      const spec = SPEC.exec(line);
      if (spec) {
        end = SPEC.lastIndex;
        node = markedNode(parseLine(inner, depth + 1), spec[1]!);
      }
    }
    // Not a mark after all: the token stays as text, and the scan goes on just after it.
    if (node === null) continue;
    textUpTo(at);
    nodes.push(node);
    from = end;
    pattern.lastIndex = end;
  }
  textUpTo(line.length);
  return nodes;
}

/** Neighbouring stretches of plain text as one, so a text with no marks is a single node. */
function joined(nodes: readonly SourceNode[]): SourceNode[] {
  const out: SourceNode[] = [];
  for (const node of nodes) {
    const last = out.at(-1);
    if (node.kind === "text" && last?.kind === "text") {
      out[out.length - 1] = { kind: "text", text: last.text + node.text };
    } else {
      out.push(node);
    }
  }
  return out;
}

/** A document's text as a tree of plain text and marks, in order. */
export function parseSource(text: string): SourceNode[] {
  if (text === "") return [];
  const lines = text.split("\n");
  return joined(
    lines.flatMap((line, index): SourceNode[] => [
      ...parseLine(line, 0),
      ...(index < lines.length - 1 ? [{ kind: "text" as const, text: "\n" }] : []),
    ]),
  );
}

/** Which kinds of mark a tree holds, for a legend that explains only what is on screen. */
export function marksIn(nodes: readonly SourceNode[]): Set<SourceNode["kind"]> {
  const found = new Set<SourceNode["kind"]>();
  const walk = (list: readonly SourceNode[]) => {
    for (const node of list) {
      if (node.kind !== "text") found.add(node.kind);
      if ("children" in node) walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

/**
 * One line that says how to read the marks on screen, or null when there are none. Bold,
 * underline and strike-through need no words; a highlight, a colour and shading do, since the
 * colours shown are the app's and not the document's.
 */
export function sourceLegend(nodes: readonly SourceNode[]): string | null {
  const marks = marksIn(nodes);
  const parts = [
    marks.has("highlight") ? "A highlight is the document's own." : null,
    marks.has("coloured") ? "A dotted underline is coloured text." : null,
    marks.has("shaded") ? "“Shaded” marks a shaded line or cell." : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** Where a question was read from in a PDF, in words: "page 4" or "pages 3 to 10". */
export function pagesLabel(pages: { from: number; to: number }): string {
  return pages.from === pages.to ? `page ${pages.from}` : `pages ${pages.from} to ${pages.to}`;
}
