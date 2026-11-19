/**
 * The shapes rich text is shown in (#605): paragraphs split on blank lines, as `RichTextView` has
 * always shown them, and a pipe table. A question that refers to "the laboratory results above"
 * carries that table in its stem, and AI import copies it there as markdown. Anything that is not
 * a well-formed table stays a paragraph, so no text is ever lost to the parse. Pure.
 */

export type RichTextBlock =
  { kind: "paragraph"; text: string } | { kind: "table"; columns: string[]; rows: string[][] };

/** A header rule cell: dashes only, with an alignment colon allowed either side (GFM). */
const RULE_CELL = /^:?-+:?$/;
/** A placeholder for `\|` while a row is split, so an escaped pipe stays inside its cell. */
const ESCAPED = "\u0000";

function cellsOf(line: string): string[] {
  let row = line.trim().replace(/\\\|/g, ESCAPED);
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.replaceAll(ESCAPED, "|").trim());
}

/**
 * A table when the first line is a header, the second its rule, and at least one row follows; the
 * table ends at the first line with no `|`, and what follows it is a paragraph of its own, so a
 * question written right under its table with no blank line still reads as text.
 */
function blocksOf(paragraph: string): RichTextBlock[] {
  const lines = paragraph.split("\n");
  const end = lines.findIndex((line) => !line.includes("|"));
  const tableLines = end === -1 ? lines : lines.slice(0, end);
  const plain: RichTextBlock[] = [{ kind: "paragraph", text: paragraph }];
  if (tableLines.length < 3) return plain;
  const columns = cellsOf(tableLines[0]);
  const rule = cellsOf(tableLines[1]);
  if (rule.length !== columns.length || !rule.every((cell) => RULE_CELL.test(cell))) return plain;
  const rows = tableLines.slice(2).map((line) => {
    const cells = cellsOf(line).slice(0, columns.length);
    return [...cells, ...Array<string>(columns.length - cells.length).fill("")];
  });
  const rest = end === -1 ? "" : lines.slice(end).join("\n");
  return [
    { kind: "table", columns, rows },
    ...(rest.trim() === "" ? [] : [{ kind: "paragraph" as const, text: rest }]),
  ];
}

export function richTextBlocks(value: string): RichTextBlock[] {
  return value
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim() !== "")
    .flatMap(blocksOf);
}
