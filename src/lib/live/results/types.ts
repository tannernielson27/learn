/**
 * How a room answered one item, shaped for the host console (#179, rendered in #180).
 *
 * Every distribution carries the labels it needs from the item, so a component can draw it from
 * this value alone. Every choice says whether it is correct: this is host-only data (ADR 0002,
 * ADR 0003), and the console decides when to show the key. Nothing here may reach a participant.
 *
 * Counts are over the answers received. `responded` counts every readable response, including
 * ones left blank; `unreadable` counts the rest (bad JSON shape, another item type, or ids the
 * item does not have), which are ignored rather than thrown on.
 */
import type { ItemType } from "@/lib/ngn/schemas";

/** One choice and how many respondents picked it. A respondent counts at most once per choice. */
export interface ChoiceCount {
  id: string;
  label: string;
  count: number;
  correct: boolean;
}

interface DistributionBase<T extends ItemType> {
  itemId: string;
  itemType: T;
  /** Readable responses, blank ones included. */
  responded: number;
  /** Responses that could not be read and were left out of every count. */
  unreadable: number;
}

/** multiple_choice and multiple_response: one bar per option. */
export interface OptionsDistribution extends DistributionBase<
  "multiple_choice" | "multiple_response"
> {
  kind: "options";
  selection: "single" | "multiple";
  options: ChoiceCount[];
  /** Respondents who selected nothing. */
  unanswered: number;
}

export interface GridRow {
  id: string;
  label: string;
  /** For a matrix, one cell per column in column order; otherwise the row's own choices. */
  cells: ChoiceCount[];
  /** Respondents who selected nothing in this row. */
  unanswered: number;
}

/** Matrices, grouping and highlight types: a row-by-cell heat map. */
export interface GridDistribution extends DistributionBase<
  | "matrix_multiple_choice"
  | "matrix_multiple_response"
  | "multiple_response_grouping"
  | "highlight_text"
  | "highlight_table"
> {
  kind: "grid";
  selection: "single" | "multiple";
  /** The shared column headings of a matrix; null when each row has its own cells. */
  columns: { id: string; label: string }[] | null;
  rows: GridRow[];
}

export interface BlankCounts {
  id: string;
  /** "Blank 1" for a cloze, the row label for a drop-down table. */
  label: string;
  choices: ChoiceCount[];
  /** Respondents who left this blank empty. */
  unanswered: number;
}

/** Drop-down and drag-and-drop cloze, and the drop-down table: per-blank choice counts. */
export interface BlanksDistribution extends DistributionBase<
  "dropdown_cloze" | "dropdown_table" | "dragdrop_cloze"
> {
  kind: "blanks";
  blanks: BlankCounts[];
}

export interface SlotCounts {
  id: "actions" | "condition" | "parameters";
  label: string;
  /** How many choices the slot takes: 2, 1, 2. */
  capacity: number;
  choices: ChoiceCount[];
  /** Respondents who placed nothing in this slot. */
  unanswered: number;
}

/** Bowtie: per-slot choice counts. */
export interface SlotsDistribution extends DistributionBase<"bowtie"> {
  kind: "slots";
  slots: SlotCounts[];
}

export interface PositionCounts {
  /** One-based. */
  position: number;
  /** How many respondents put each item here; `correct` marks the item the key puts here. */
  choices: ChoiceCount[];
  /** Respondents whose order stops before this position. */
  unanswered: number;
}

/** Ordered response: per-position counts. */
export interface OrderDistribution extends DistributionBase<"ordered_response"> {
  kind: "order";
  positions: PositionCounts[];
  /** Respondents whose whole order matches the key. */
  exact: number;
}

export interface CombinationPick {
  blankId: string;
  /** Null when the respondent left this blank empty. */
  choice: { id: string; label: string; correct: boolean } | null;
}

export interface WrongCombination {
  picks: CombinationPick[];
  count: number;
}

/** The rationale types: the most common wrong combinations, plus per-blank counts. */
export interface PairsDistribution extends DistributionBase<
  "dropdown_rationale" | "dragdrop_rationale"
> {
  kind: "pairs";
  /** The blank the others hang on (a triad's condition); null for a dyad. */
  anchorBlankId: string | null;
  blanks: BlankCounts[];
  /** Respondents who filled every blank correctly. */
  allCorrect: number;
  /** Most frequent first, at most `COMMON_WRONG_LIMIT`; a response with no blank filled is not one. */
  commonWrong: WrongCombination[];
}

export type Distribution =
  | OptionsDistribution
  | GridDistribution
  | BlanksDistribution
  | SlotsDistribution
  | OrderDistribution
  | PairsDistribution;

export type DistributionKind = Distribution["kind"];
