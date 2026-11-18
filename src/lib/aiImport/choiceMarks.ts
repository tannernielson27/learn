import { MARKS, SHADE, readLine, type MarkedLine } from "./lineMarks";

/**
 * Formatting that sets some of a question's choices apart (#592, owner decision 2026-11-17).
 *
 * Many instructors mark the right answer by making it bold, underlined, red or shaded, with no
 * `*` and no "Answer:" line. That is a mark a key could have been copied from, but only on a
 * choice. Bold is everywhere in a document: on a stem, a heading, a label such as "Rationale"
 * or "**Question 4**", a table's header, a term in a list of notes. None of that says which
 * option is right, and counting it would let through a key the model made up. So the rule is
 * about choices, not about any list or table:
 *
 * - **A choice group** is a run of sibling items one after another: lettered or numbered list
 *   items, bullets, the lines of one table cell, or the body rows of a table. A list whose
 *   numbering starts again (a "1." or "A." after a higher label) is a new group, so a numbered
 *   stem is never grouped with its own options. An item that ends in `?` or `:`, or that is a
 *   label (Rationale, Note, Answer, Priority, Question 4, Step 2...), is not a choice and ends
 *   the group. Nothing after a "Rationale" or "Explanation" heading is a choice.
 * - **A mark counts** only in a group of two or more choices, when at least one of them and not
 *   all of them carry it across the whole choice: all of an item's words, or every cell of a
 *   table row. One word made bold inside a choice ("the **first** action") is emphasis.
 * - In a bulleted list, where no letter or number tells a heading from an option, a mark on the
 *   first item alone is taken for a heading over the rest.
 * - **In a table**, the header row never counts. Beside whole rows, one marked cell counts when
 *   it is not in the first column (the row's own label) and another row's cell in its column is
 *   not marked: the matrix case. An empty shaded cell is only ever a mark, so it counts even
 *   when every row shades the same column. Shading that alternates down four or more rows is
 *   banding.
 *
 * Shading is a strong mark, as a highlight is. Bold, underline and font colour are weaker: the
 * key is believed, and the entry asks the teacher to check it.
 */

const BREAK = /<br\s*\/?>/gi;

/** Words that head a part of a question and are never one of its choices. */
const LABEL_WORDS =
  /^(?:rationales?|explanations?|feedback|notes?|instructor notes?|answers?|answer key|keys?|priority|references?|objectives?|scoring rule|case study|question\s+\d+|step\s+\d+)\s*(?:[:.]|$)/i;
/** A heading after which the document explains its answer; what follows is not a choice. */
const AFTERWORD = /^(?:rationales?|explanations?|feedback)\b\s*(?:[:.–-]|$|for\b)/i;

/** An item that asks or introduces (`?`, `:`) or names a part of the question is not a choice. */
const isChoice = (line: MarkedLine): boolean =>
  line.text !== "" && !/[?:]$/.test(line.text) && !LABEL_WORDS.test(line.text);

const has = (line: MarkedLine, mark: number): boolean => (line.whole & mark) !== 0;

/**
 * The marks that set some choices of one group apart. `ordered` says the group is lettered or
 * numbered, so its first item is a choice like the rest.
 */
function groupMarks(choices: readonly MarkedLine[], ordered: boolean): number {
  if (choices.length < 2) return 0;
  let found = 0;
  for (const mark of MARKS) {
    const marked = choices.filter((choice) => has(choice, mark));
    if (marked.length === 0 || marked.length === choices.length) continue;
    // "- **Term**" over plain bullets is a heading for them, not the first of the options.
    if (!ordered && marked.length === 1 && marked[0] === choices[0]) continue;
    found |= mark;
  }
  return found;
}

/** The lists of `lines` as choice groups, read in order. */
class ListReader {
  found = 0;
  private group: MarkedLine[] = [];
  private list: string | null = null;

  /** Ends the group being read, counting what its marks show. */
  close(): void {
    const ordered = this.group.every((choice) => choice.ordinal !== null);
    this.found |= groupMarks(this.group, ordered);
    this.group = [];
    this.list = null;
  }

  add(line: MarkedLine): void {
    if (line.list === null || !isChoice(line)) {
      this.close();
      return;
    }
    const last = this.group.at(-1);
    const restarted =
      last !== undefined &&
      last.ordinal !== null &&
      line.ordinal !== null &&
      line.ordinal <= last.ordinal;
    if (line.list !== this.list || restarted) this.close();
    this.list = line.list;
    this.group = [...this.group, line];
  }
}

const isTableRow = (line: string) => line.trim().startsWith("|");
const isSeparatorRow = (cells: readonly string[]) =>
  cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));

function cellsOf(line: string): string[] {
  const cells = line.trim().split(/(?<!\\)\|/);
  return cells.slice(1, cells.at(-1)?.trim() === "" ? -1 : cells.length);
}

/** The marks on one line among the several lines of a cell (`<br>` between them). */
function cellLineMarks(cell: string): number {
  const reader = new ListReader();
  // Trimmed: the space after the cell's `|` is not an indent.
  const lines = cell
    .split(BREAK)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length < 2) return 0;
  for (const line of lines) {
    const read = readLine(line);
    // Lines of a cell are siblings with or without a label of their own.
    reader.add({ ...read, list: read.list ?? "cell" });
  }
  reader.close();
  return reader.found;
}

/** Shading on every other row, down four rows or more, is how a table is striped. */
function isBanding(rows: readonly boolean[]): boolean {
  return rows.length >= 4 && rows.every((shaded, at) => at === 0 || shaded !== rows[at - 1]);
}

/**
 * The marks that set a choice apart in one table's body rows (its header row left out): on a
 * whole row among the rows, on one cell among the cells of its column, or on one line of a cell.
 */
function tableMarks(body: readonly string[][], width: number): number {
  const grid = body.map((row) => row.map((cell) => readLine(cell.replace(BREAK, " "))));
  const counted = (cell: MarkedLine) => cell.text !== "" || has(cell, SHADE);
  const rowMarked = (row: readonly MarkedLine[], mark: number) =>
    row.length === width && row.every((cell) => counted(cell) && has(cell, mark));

  let found = 0;
  for (const row of body) for (const cell of row) found |= cellLineMarks(cell);

  const choiceRows = grid.filter((row) => row[0] !== undefined && isChoice(row[0]));
  for (const mark of MARKS) {
    const marked = choiceRows.filter((row) => rowMarked(row, mark)).length;
    const banding = mark === SHADE && isBanding(grid.map((row) => rowMarked(row, SHADE)));
    if (choiceRows.length > 1 && marked > 0 && marked < choiceRows.length && !banding) {
      found |= mark;
    }
  }

  // One cell, not a whole row and not the row's own label in the first column.
  grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (c === 0) return;
      for (const mark of MARKS) {
        if (!has(cell, mark) || rowMarked(row, mark)) continue;
        const others = grid.filter((_, at) => at !== r).map((other) => other[c]);
        const setApart = others.some((other) => other === undefined || !has(other, mark));
        // An empty shaded cell holds nothing to emphasise: it can only be a mark.
        const onlyAMark = mark === SHADE && cell.text === "";
        if ((others.length > 0 && setApart) || onlyAMark) found |= mark;
      }
    });
  });
  return found;
}

/**
 * The marks in one table, given its lines. The rows above the `---` line are its header and
 * never count; a table with no such line (one the region cuts into) is all body.
 */
function tableLineMarks(lines: readonly string[]): number {
  const all = lines.map(cellsOf);
  const separator = all.findIndex(isSeparatorRow);
  const rows = all.filter((cells) => !isSeparatorRow(cells));
  const width = Math.max(0, ...rows.map((row) => row.length));
  return tableMarks(rows.slice(Math.max(0, separator)), width);
}

/** The marks that set a choice apart anywhere in `region`. */
function regionMarks(region: string): number {
  const lists = new ListReader();
  const tables: string[][] = [];
  let inTable = false;
  for (const raw of region.split("\n")) {
    // A blank line ends a table, but not a list: typed options are a paragraph each.
    if (raw.trim() === "") {
      inTable = false;
      continue;
    }
    if (isTableRow(raw)) {
      lists.close();
      if (inTable) tables[tables.length - 1] = [...tables[tables.length - 1], raw];
      else tables.push([raw]);
      inTable = true;
      continue;
    }
    inTable = false;
    const line = readLine(raw.replace(/^\s*#{1,6}\s+/, ""));
    // The document goes on to explain its answer: nothing below is a choice.
    if (AFTERWORD.test(line.text)) break;
    lists.add(line);
  }
  lists.close();
  return tables.reduce((found, lines) => found | tableLineMarks(lines), lists.found);
}

export interface ChoiceMarks {
  /** Shading sets some of the choices apart. */
  shading: boolean;
  /** Bold, underline or font colour sets some of the choices apart. */
  emphasis: boolean;
}

/** What formatting in `region` sets some choices apart, by the rules at the top of this file. */
export function choiceMarks(region: string): ChoiceMarks {
  const found = regionMarks(region);
  return { shading: (found & SHADE) !== 0, emphasis: (found & ~SHADE) !== 0 };
}
