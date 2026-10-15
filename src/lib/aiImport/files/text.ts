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

/** One block longer than `max`, cut at its lines, and a line longer than `max` anywhere. */
function cutLong(block: string, max: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const line of block.split("\n")) {
    if (line.length > max) {
      if (current) pieces.push(current);
      current = "";
      for (let i = 0; i < line.length; i += max) pieces.push(line.slice(i, i + max));
      continue;
    }
    const joined = current ? `${current}\n${line}` : line;
    if (joined.length > max) {
      pieces.push(current);
      current = line;
    } else {
      current = joined;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function chunkText(
  text: string,
  target: number = TEXT_CHUNK_TARGET_CHARS,
  max: number = TEXT_CHUNK_MAX_CHARS,
): string[] {
  const chunks: string[] = [];
  let open: Span | null = null;
  const flush = () => {
    if (open) chunks.push(text.slice(open.start, open.end));
    open = null;
  };

  for (const unit of blocks(text)) {
    const length = unit.end - unit.start;
    if (length > max) {
      flush();
      chunks.push(...cutLong(text.slice(unit.start, unit.end), max));
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
