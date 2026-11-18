/**
 * Formatting that singles one choice out (#592, owner decision 2026-11-17).
 *
 * Many instructors mark the right answer by making it bold, underlined, red or shaded, with no
 * `*` and no "Answer:" line. That is a mark a key could have been copied from, but only where it
 * sets one choice apart from the others beside it. Bold is everywhere in a document: on a stem,
 * a heading, a label such as "**Question 4**", a table's header row, the first column of a chart.
 * None of that says which option is right, and counting it would let through a key the model
 * made up. So formatting counts only:
 *
 * - on a list item (a line that starts with a letter, a number or a bullet), when the mark
 *   covers the whole item or exactly its label, and at least one other item of the same list
 *   does not have it;
 * - on a table cell, when the mark covers the whole cell, and neither every cell of its row nor
 *   every cell of its column has it (a header row, a row of labels, zebra striping);
 * - on one of the lines inside a table cell, when another line of that cell does not have it.
 *
 * A word made bold inside an option ("the **first** action") is emphasis, not a key, and does
 * not count. Shading is a strong mark, as a highlight is. Bold, underline and font colour are
 * weaker: the key is believed, and the entry asks the teacher to check it.
 */

const BOLD = 1;
const UNDERLINE = 2;
const COLOUR = 4;
const SHADE = 8;
const WEAK = [BOLD, UNDERLINE, COLOUR] as const;

/** `==text=={yellow}` or `=={color #C00000}`: a highlighted or coloured stretch of a .docx. */
const COLOURED = /==((?:(?!==)[^\n])+?)==\{([^{}\n]{1,40})\}/g;
const SHADED = /\{shaded\s+#[0-9A-Fa-f]{6}\}/gi;
const BREAK = /<br\s*\/?>/gi;

/** A list item's label: `A.`, `b)`, `(3)`, `iv.`, or a bullet. Captured without its indent. */
const LABEL = /^(\(?(?:\d{1,3}|[A-Za-z]|[ivxl]{2,5}|[IVXL]{2,5})[.)]|[-•–+▪●○➢])\s+/;
const STAR_BULLET = /^\*\s+(?=\S)/;

interface Marked {
  /** The characters a reader sees, markers taken out. */
  text: string;
  /** For each character of `text`, the marks on it. */
  marks: number[];
}

/** Which marks the text after a stretch's `==` carries: font colour, and nothing for a highlight. */
const stretchMarks = (tag: string): number =>
  tag.split(",").some((part) => /^color\b/i.test(part.trim())) ? COLOUR : 0;

/** Reads one line's markers into the marks on each character. An unclosed marker marks nothing. */
function readMarks(line: string): Marked {
  const stretch = new Array<number>(line.length).fill(0);
  const hidden = new Array<boolean>(line.length).fill(false);
  for (const match of line.matchAll(COLOURED)) {
    const open = match.index;
    const inner = open + 2;
    const close = inner + match[1].length;
    stretch.fill(stretchMarks(match[2]), inner, close);
    hidden.fill(true, open, inner);
    hidden.fill(true, close, open + match[0].length);
  }

  let text = "";
  const marks: number[] = [];
  let bold = false;
  let underline = false;
  let boldMarkers = 0;
  let underlineDepth = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (hidden[i]) continue;
    if (line.startsWith("**", i)) {
      bold = !bold;
      boldMarkers += 1;
      i += 1;
    } else if (line.startsWith("~~", i)) {
      i += 1;
    } else if (line.startsWith("<u>", i)) {
      underline = true;
      underlineDepth += 1;
      i += 2;
    } else if (line.startsWith("</u>", i)) {
      underline = false;
      underlineDepth -= 1;
      i += 3;
    } else if (line[i] !== "*") {
      // A lone `*` is an italic marker or a key's own star: neither is part of the words.
      // A backslash escapes the character after it (`\|` in a table cell).
      if (line[i] === "\\" && i + 1 < line.length) i += 1;
      text += line[i];
      marks.push((bold ? BOLD : 0) | (underline ? UNDERLINE : 0) | stretch[i]);
    }
  }
  // A marker left open belongs to a stretch that runs past this line, cut by the region's edge.
  const broken = (boldMarkers % 2 === 1 ? BOLD : 0) | (underlineDepth !== 0 ? UNDERLINE : 0);
  return broken === 0 ? { text, marks } : { text, marks: marks.map((mark) => mark & ~broken) };
}

/** The marks every visible character of `text[from, to)` carries; 0 when there is none. */
function sharedMarks(marked: Marked, from: number, to: number): number {
  let shared = BOLD | UNDERLINE | COLOUR;
  let seen = false;
  for (let i = from; i < to; i += 1) {
    if (/\s/.test(marked.text[i])) continue;
    shared &= marked.marks[i];
    seen = true;
  }
  return seen ? shared : 0;
}

/** The marks any visible character of `text[from, to)` carries. */
function anyMarks(marked: Marked, from: number, to: number): number {
  let any = 0;
  for (let i = from; i < to; i += 1) any |= marked.marks[i];
  return any;
}

interface Choice {
  /** Which list it belongs to: its indent and the kind of its label; null for no label. */
  list: string | null;
  /** Whether it holds any words. */
  hasText: boolean;
  /** The marks that cover all of its text, shading included. */
  whole: number;
  /** The marks that cover its label and nothing else. */
  labelOnly: number;
}

function labelKind(label: string): string {
  if (/\d/.test(label)) return "digit";
  if (/[a-z]/.test(label)) return "lower";
  return /[A-Z]/.test(label) ? "upper" : "bullet";
}

/** One list item, table cell or line of a cell, with the marks that set it apart. */
function readChoice(raw: string): Choice {
  const indent = /^\s*/.exec(raw)?.[0].length ?? 0;
  const shaded = raw.search(SHADED) >= 0;
  let line = raw.replace(SHADED, " ").trim();
  let list: string | null = null;
  if (STAR_BULLET.test(line)) {
    line = line.replace(STAR_BULLET, "");
    list = `${indent}:bullet`;
  }
  const marked = readMarks(line);
  const label = list === null ? LABEL.exec(marked.text) : null;
  const labelEnd = label ? label[1].length : 0;
  const restStart = label ? label[0].length : 0;
  if (label) list = `${indent}:${labelKind(label[1])}`;
  const hasText = marked.text.slice(restStart).trim() !== "";
  const whole = hasText ? sharedMarks(marked, restStart, marked.text.length) : 0;
  const onLabel = sharedMarks(marked, 0, labelEnd);
  return {
    list,
    hasText,
    whole: whole | (shaded ? SHADE : 0),
    labelOnly: onLabel & ~anyMarks(marked, restStart, marked.text.length),
  };
}

/** The marks some, but not all, of `choices` carry, in the way `pick` reads them. */
function setApart(choices: readonly Choice[], pick: (choice: Choice) => number): number {
  if (choices.length < 2) return 0;
  let found = 0;
  for (const mark of [...WEAK, SHADE]) {
    const count = choices.filter((choice) => (pick(choice) & mark) !== 0).length;
    if (count > 0 && count < choices.length) found |= mark;
  }
  return found;
}

const wholeOf = (choice: Choice) => choice.whole;
const labelOf = (choice: Choice) => choice.labelOnly;

/** The marks that set one item of a group of choices apart, on the whole item or on its label. */
const groupMarks = (choices: readonly Choice[]): number =>
  setApart(choices, wholeOf) | setApart(choices, labelOf);

const isTableRow = (line: string) => line.trim().startsWith("|");
const isSeparatorRow = (cells: readonly string[]) =>
  cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));

function cellsOf(line: string): string[] {
  const cells = line.trim().split(/(?<!\\)\|/);
  return cells.slice(1, cells.at(-1)?.trim() === "" ? -1 : cells.length);
}

/** The lines of a cell that holds more than one (`<br>` between them). */
function cellLines(cell: string): string[] {
  return cell
    .split(BREAK)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * The marks that single a cell out of one table: on a whole cell that neither its row nor its
 * column shares, or on one line among several in a cell. Row 0 is the header row, as markdown
 * tables put it.
 */
function tableMarks(rows: readonly string[][]): number {
  const width = Math.max(...rows.map((row) => row.length));
  const grid = rows.map((row) => row.map((cell) => readChoice(cell.replace(BREAK, " "))));
  const counted = (choice: Choice) => choice.hasText || (choice.whole & SHADE) !== 0;
  const allHave = (choices: readonly Choice[], mark: number) =>
    choices.every((choice) => (choice.whole & mark) !== 0);

  let found = 0;
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const lines = cellLines(cell);
      if (lines.length > 1) found |= groupMarks(lines.map(readChoice));
      // The title of a one-column table is its header, never a choice.
      if (r === 0 && width === 1) return;
      const rowCells = grid[r].filter(counted);
      const columnCells = grid
        .filter((_, at) => at > 0)
        .map((other) => other[c])
        .filter((other): other is Choice => other !== undefined && counted(other));
      for (const mark of [...WEAK, SHADE]) {
        if ((grid[r][c].whole & mark) === 0) continue;
        const wholeRow = width > 1 && allHave(rowCells, mark);
        const wholeColumn = r > 0 && columnCells.length > 1 && allHave(columnCells, mark);
        if (!wholeRow && !wholeColumn) found |= mark;
      }
    });
  });
  return found;
}

/** The lists and tables of `region`: its list items by list, and each table's rows of cells. */
function readRegion(region: string): { lists: Choice[][]; tables: string[][][] } {
  const lists = new Map<string, Choice[]>();
  const tables: string[][][] = [];
  let table: string[][] | null = null;
  for (const line of region.split("\n")) {
    if (isTableRow(line)) {
      const cells = cellsOf(line);
      if (table === null) tables.push((table = []));
      if (!isSeparatorRow(cells)) table.push(cells);
      continue;
    }
    table = null;
    const choice = readChoice(line);
    if (choice.list === null || !(choice.hasText || choice.whole !== 0)) continue;
    lists.set(choice.list, [...(lists.get(choice.list) ?? []), choice]);
  }
  return { lists: [...lists.values()], tables: tables.filter((rows) => rows.length > 0) };
}

export interface ChoiceMarks {
  /** Shading sets a list item or a table cell apart. */
  shading: boolean;
  /** Bold, underline or font colour sets a list item or a table cell apart. */
  emphasis: boolean;
}

/** What formatting in `region` singles a choice out, by the rules at the top of this file. */
export function choiceMarks(region: string): ChoiceMarks {
  const { lists, tables } = readRegion(region);
  const found =
    lists.reduce((marks, list) => marks | groupMarks(list), 0) |
    tables.reduce((marks, rows) => marks | tableMarks(rows), 0);
  return {
    shading: (found & SHADE) !== 0,
    emphasis: WEAK.some((mark) => (found & mark) !== 0),
  };
}
