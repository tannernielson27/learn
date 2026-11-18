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
 */

export type SourceMark = "bold" | "underline" | "struck" | "highlight" | "coloured";

export type SourceNode =
  | { kind: "text"; text: string }
  | { kind: SourceMark; children: SourceNode[] }
  | { kind: "break" }
  | { kind: "shaded" };

/** One pass finds whichever mark starts first; the groups say which, and hold what is inside. */
const MARK =
  /<br\s*\/?>|\{shaded\s+#[0-9A-Fa-f]{6}\}|==((?:(?!==)[^\n])+)==\{([^{}\n]{1,40})\}|\*\*((?:(?!\*\*)[^\n])+)\*\*|<u>((?:(?!<\/u>)[^\n])*)<\/u>|~~([^~\n]+)~~/gi;

function markOf(match: RegExpExecArray): SourceNode {
  const [whole, marked, colour, bold, underlined, struck] = match;
  if (marked !== undefined) {
    const spec = (colour ?? "").trim().toLowerCase();
    const inner = parseSource(marked);
    // `{color #C00000}` is font colour alone; `{yellow, color #C00000}` is a highlight as well.
    if (spec.startsWith("color")) return { kind: "coloured", children: inner };
    return {
      kind: "highlight",
      children: spec.includes("color") ? [{ kind: "coloured", children: inner }] : inner,
    };
  }
  if (bold !== undefined) return { kind: "bold", children: parseSource(bold) };
  if (underlined !== undefined) return { kind: "underline", children: parseSource(underlined) };
  if (struck !== undefined) return { kind: "struck", children: parseSource(struck) };
  return whole.startsWith("{") ? { kind: "shaded" } : { kind: "break" };
}

/** A document's text as a tree of plain text and marks, in order. */
export function parseSource(text: string): SourceNode[] {
  const nodes: SourceNode[] = [];
  const pattern = new RegExp(MARK.source, MARK.flags);
  let from = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match.index > from) nodes.push({ kind: "text", text: text.slice(from, match.index) });
    nodes.push(markOf(match));
    from = match.index + match[0].length;
  }
  if (from < text.length) nodes.push({ kind: "text", text: text.slice(from) });
  return nodes;
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
