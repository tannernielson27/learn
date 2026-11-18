import { CHARS_PER_PAGE, TEXT_CHUNK_MAX_CHARS, TEXT_CHUNK_TARGET_CHARS } from "./limits";

/**
 * Markdown and plain text (#341), and the markdown a .docx becomes: decoded as UTF-8 and cut into
 * chunks of about 8 pages of characters, each ending at a heading or a blank line so a question
 * is not split. Each chunk is a slice of the text exactly as it was; nothing is rewritten.
 */

/** UTF-8 to a string, without a BOM and with `\n` line ends. Throws on bytes that are not UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false })
    .decode(bytes)
    .replace(/\r\n?/g, "\n");
}

/** Pages for a file that has none of its own: about 3,000 characters a page, at least one. */
export function estimatePages(chars: number): number {
  return Math.max(1, Math.ceil(chars / CHARS_PER_PAGE));
}

interface Span {
  start: number;
  end: number;
}

const HEADING = /^#{1,6}\s/;

/** The text between blank lines, with a heading on its own joined to what follows it. */
function blocks(text: string): Span[] {
  const spans: Span[] = [];
  const separator = /\n[ \t]*\n\s*/g;
  let start = 0;
  for (const match of text.matchAll(separator)) {
    spans.push({ start, end: match.index });
    start = match.index + match[0].length;
  }
  spans.push({ start, end: text.length });
  const nonBlank = spans
    .map((span) => trimSpan(text, span))
    .filter((span) => span.end > span.start);

  const units: Span[] = [];
  for (let i = 0; i < nonBlank.length; i += 1) {
    const span = nonBlank[i];
    const body = text.slice(span.start, span.end);
    const next = nonBlank[i + 1];
    if (next && HEADING.test(body) && !body.includes("\n")) {
      units.push({ start: span.start, end: next.end });
      i += 1;
    } else {
      units.push(span);
    }
  }
  return units;
}

function trimSpan(text: string, { start, end }: Span): Span {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s])) s += 1;
  while (e > s && /\s/.test(text[e - 1])) e -= 1;
  return { start: s, end: e };
}

/** The lines of `block`, as spans of the text. */
function lines(text: string, block: Span): Span[] {
  const spans: Span[] = [];
  let start = block.start;
  while (start <= block.end) {
    const next = text.indexOf("\n", start);
    const end = next === -1 || next > block.end ? block.end : next;
    spans.push({ start, end });
    start = end + 1;
  }
  return spans;
}

/** One block longer than `max`, cut at its lines, and a line longer than `max` anywhere. */
function cutLong(text: string, block: Span, max: number): Span[] {
  const pieces: Span[] = [];
  let current: Span | null = null;
  for (const line of lines(text, block)) {
    if (line.end - line.start > max) {
      if (current) pieces.push(current);
      current = null;
      for (let at = line.start; at < line.end; at += max) {
        pieces.push({ start: at, end: Math.min(at + max, line.end) });
      }
      continue;
    }
    // An empty line starts no piece: it falls between two, as the blank line between chunks does.
    const fresh = line.end > line.start ? line : null;
    if (current === null) {
      current = fresh;
    } else if (line.end - current.start > max) {
      pieces.push(current);
      current = fresh;
    } else {
      current = { start: current.start, end: line.end };
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Where each chunk of `text` starts and ends. The chunks do not touch: the blank line, line end
 * or leading space between two of them belongs to neither, and `text.slice(a.end, b.start)` is
 * what was cut away between chunk `a` and the next, `b` (#592).
 */
export function chunkSpans(
  text: string,
  target: number = TEXT_CHUNK_TARGET_CHARS,
  max: number = TEXT_CHUNK_MAX_CHARS,
): Span[] {
  const chunks: Span[] = [];
  let open: Span | null = null;
  const flush = () => {
    if (open) chunks.push(open);
    open = null;
  };

  for (const unit of blocks(text)) {
    const length = unit.end - unit.start;
    if (length > max) {
      flush();
      chunks.push(...cutLong(text, unit, max));
      continue;
    }
    if (open === null) {
      open = { ...unit };
      continue;
    }
    const current: Span = open;
    const grown = unit.end - current.start;
    const isHeading = HEADING.test(text.slice(unit.start, unit.start + 7));
    if (grown > target || (isHeading && current.end - current.start >= target / 2)) {
      flush();
      open = { ...unit };
    } else {
      open = { start: current.start, end: unit.end };
    }
  }
  flush();
  return chunks;
}

/** The chunks of `text`, each a slice of it exactly as it was. */
export function chunkText(
  text: string,
  target: number = TEXT_CHUNK_TARGET_CHARS,
  max: number = TEXT_CHUNK_MAX_CHARS,
): string[] {
  return chunkSpans(text, target, max).map((span) => text.slice(span.start, span.end));
}

/** A chunk of text with the text that was cut away just before it. */
export interface TextPart {
  position: number;
  text: string;
  /** What stood between the chunk before and this one; absent for a chunk made another way. */
  gapBefore?: string;
}

/**
 * Chunks of one text put back together (#592). Neighbouring chunks are joined by exactly what
 * was cut from between them, so the join reads as the document does: a question that crosses a
 * chunk boundary keeps the line break between its last option and the next stem, and a table
 * keeps its rows apart. Chunks that are not neighbours get a blank line, so their words never
 * run together.
 */
export function joinTextParts(parts: readonly TextPart[]): string {
  return parts
    .map((part, index) => {
      if (index === 0) return part.text;
      const neighbours = parts[index - 1].position === part.position - 1;
      const gap = neighbours ? (part.gapBefore ?? "") : part.gapBefore || "\n\n";
      return `${gap}${part.text}`;
    })
    .join("");
}
