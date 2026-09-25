import type { ItemType } from "@/lib/ngn/labels";
import type { CjmmStep, ScoringModel } from "@/lib/ngn/types";

/**
 * The words on /help/items (#269). Every scoring sentence here is taken from
 * docs/01-NGN-ITEM-SPEC.md (§2 scoring models, §3 item catalog, §4 composites); change that file
 * first and this one to match, never the other way round. Kept as data so a unit test can hold the
 * guide to ITEM_TYPES and to each fixture's scoring model.
 */
export interface ItemGuideEntry {
  /** What the format asks the student to do, and what it is good for. */
  tests: string;
  /** The model name, checked against the type's fixture. */
  model: ScoringModel;
  /** How the item is scored, from docs/01. */
  scoring: string;
  /** One piece of advice for the author. */
  tip: string;
}

/** The anchor a type's section has on /help/items, such as `dropdown-rationale`. */
export function helpSectionId(type: ItemType): string {
  return type.replaceAll("_", "-");
}

export const MODEL_NAMES: Record<ScoringModel, string> = {
  zero_one: "0/1",
  plus_minus: "+/-",
  rationale: "Rationale",
};

export const ITEM_GUIDE: Record<ItemType, ItemGuideEntry> = {
  multiple_choice: {
    tests: "Choosing the one best answer from 4 to 6 options.",
    model: "zero_one",
    scoring: "0/1, max 1: the correct option earns 1 point, anything else earns 0.",
    tip: "Take-home assignments can shuffle the options. An option that points at others or at a position, such as “All of the above”, stays where you put it.",
  },
  multiple_response: {
    tests:
      "Recognizing every finding or action that applies. Select all that apply (SATA) has 5 to 10 options with at least one correct; Select N asks for exactly N.",
    model: "plus_minus",
    scoring:
      "+/-: +1 for each correct selection, -1 for each incorrect selection, and the score never goes below 0. Max = the number of correct options.",
    tip: "Write a rationale for each option. The editor warns when every option is correct, or when an option has no rationale of its own.",
  },
  multiple_response_grouping: {
    tests:
      "Sorting findings by group: a table where each row (a body system, say) has 2 to 4 option cells, and the student selects all that apply in each row.",
    model: "plus_minus",
    scoring: "+/-, applied to each row and then summed. Max = the total number of correct cells.",
    tip: "Keep each row to one idea, so a wrong choice costs a point in that row and nowhere else.",
  },
  matrix_multiple_choice: {
    tests:
      "Making one call per row against a shared scale of 2 or 3 columns, such as Indicated / Contraindicated / Non-essential.",
    model: "zero_one",
    scoring:
      "0/1 per row: each row earns 1 point when its one selection is correct. Max = the number of rows. An unanswered row earns 0.",
    tip: "Use 2 to 8 rows. Rows can be shuffled in take-home work; the columns never move, because they are a scale.",
  },
  matrix_multiple_response: {
    tests:
      "Making several calls per row: rows by columns, with any number of selections in each row (at least one per row is typical).",
    model: "plus_minus",
    scoring: "+/-, applied to each row and then summed.",
    tip: "Use it when a finding can belong to more than one column, such as a sign seen in two conditions. If each row has exactly one answer, use Matrix Multiple Choice instead.",
  },
  dropdown_cloze: {
    tests:
      "Completing prose: 1 to 3 inline drop-down blanks, each with 3 to 5 choices, usually to analyze cues.",
    model: "zero_one",
    scoring: "0/1 per blank: each blank earns 1 point when its choice is correct.",
    tip: "Make every choice fit the sentence grammatically, so the wording does not give the answer away.",
  },
  dropdown_rationale: {
    tests:
      "Linking a conclusion to its evidence in one sentence with 2 blanks (a dyad) or 3 (a triad), such as “The client is at risk for __ as evidenced by __.”",
    model: "rationale",
    scoring:
      "Rationale scoring. Dyad: 1 point only if both are correct. Triad: 2 points max; the anchor (usually the condition) must be correct, and each of the two supporting blanks then earns 1. Anchor wrong: 0.",
    tip: "A triad needs an anchor: tick “This blank is the anchor the others support” on the blank the other two depend on, usually the condition.",
  },
  dropdown_table: {
    tests: "Making one choice per row of a table, where one column holds a drop-down in each row.",
    model: "zero_one",
    scoring: "0/1 per row: each row earns 1 point when its choice is correct.",
    tip: "Rows and each row's choices can be shuffled in take-home work; the column headings stay put.",
  },
  highlight_text: {
    tests:
      "Recognizing cues in a passage. You mark the phrases a student can select; the rest of the text cannot be selected.",
    model: "plus_minus",
    scoring:
      "+/-: +1 for each correct phrase selected, -1 for each incorrect one, never below 0. Max = the number of correct phrases.",
    tip: "Give it at least 2 selectable phrases with at least 1 correct. The editor warns when more than 60% of them are correct.",
  },
  highlight_table: {
    tests:
      "Recognizing cues in a table, such as Assessment / Findings: the selectable phrases sit inside the cells.",
    model: "plus_minus",
    scoring: "+/-, over the whole item, or per row when “Score each row separately” is on.",
    tip: "The table is never shuffled, because where a finding sits is part of the answer.",
  },
  dragdrop_cloze: {
    tests:
      "Completing prose from a word bank of 4 to 8 words dragged into 1 to 3 blanks. On a phone, tap a word and then tap a blank.",
    model: "zero_one",
    scoring: "0/1 per blank: each blank earns 1 point when its word is correct.",
    tip: "Each word can be used once, unless you turn on “Let a word fill more than one blank”.",
  },
  dragdrop_rationale: {
    tests:
      "The drop-down rationale sentence, answered from a word bank: a dyad (2 blanks) or a triad (3 blanks).",
    model: "rationale",
    scoring:
      "Rationale scoring. Dyad: 1 point only if both are correct. Triad: 2 points max; the anchor must be correct, and each of the two supporting blanks then earns 1. Anchor wrong: 0.",
    tip: "Put plausible wrong words in the bank for both the condition and the evidence, so neither blank can be solved alone.",
  },
  ordered_response: {
    tests: "Putting 4 to 6 steps in order, by dragging or with up and down buttons.",
    model: "zero_one",
    scoring:
      "0/1 for the whole item: 1 point only for the exact order. With “Give a point for each step in the right place” on, each step in its correct position earns 1 instead. It is off by default.",
    tip: "Type the steps in their correct order. Students always start from a scrambled order that is never the answer.",
  },
  bowtie: {
    tests:
      "Pulling a whole scenario together: pick the 1 potential condition from 4, 2 actions to take from 5, and 2 parameters to monitor from 5.",
    model: "zero_one",
    scoring: "0/1 per slot, 5 slots, max 5. The order within a pair does not matter.",
    tip: "Make the wrong actions and parameters fit one of the wrong conditions, so the student has to commit to the condition first.",
  },
};

export interface CompositeGuideEntry {
  id: string;
  title: string;
  body: string[];
  scoring: string;
}

export const COMPOSITE_GUIDE: CompositeGuideEntry[] = [
  {
    id: "case-study",
    title: "Case study",
    body: [
      "Six items, one for each clinical judgment step, in the fixed order below. The patient record sits beside every item: a pane on a laptop, a sheet on a phone.",
      "Build one with New case study in a bank. It needs exactly 6 items, steps 1 to 6 in order, and a record with at least one section.",
    ],
    scoring: "Each step is an ordinary item, scored by its own format’s rule.",
  },
  {
    id: "trend",
    title: "Trend item",
    body: [
      "Not a separate format: any standalone item becomes a Trend item when its patient record is charted at two or more times. The record then offers a time selector.",
      "Use it to ask what changed, for example whether each finding improved, stayed the same or declined over a shift.",
    ],
    scoring: "Scored by the rule of the format it uses.",
  },
];

export interface CjmmGuideEntry {
  /** What the step asks of the student. */
  asks: string;
  /** Typical formats, from docs/01 §1. */
  formats: string;
}

export const CJMM_GUIDE: Record<CjmmStep, CjmmGuideEntry> = {
  1: {
    asks: "Which information in the record matters, and which is noise?",
    formats: "Highlight Text or Table, select all that apply, Matrix Multiple Response.",
  },
  2: {
    asks: "What could these cues mean? Link the findings to the conditions they point to.",
    formats: "Drop-Down Cloze or Rationale, Matrix Multiple Choice, Multiple Response Grouping.",
  },
  3: {
    asks: "Which explanation is most likely, and which is most urgent?",
    formats: "Drop-Down Rationale, Drag-and-Drop Rationale, Select N.",
  },
  4: {
    asks: "What outcomes are wanted, and which interventions could reach them?",
    formats: "Select all that apply, Drop-Down Table, Matrix Multiple Choice or Response.",
  },
  5: {
    asks: "Which interventions should the nurse carry out now?",
    formats: "Drag-and-Drop Cloze, Matrix Multiple Choice, Select N.",
  },
  6: {
    asks: "Did the interventions work? Compare what happened with what was expected.",
    formats:
      "Matrix Multiple Choice (improved / no change / declined), Highlight, select all that apply.",
  },
};

export interface HelpFigure {
  /** Path under public/. */
  src: string;
  /** The committed Playwright baseline it copies, under e2e/__screenshots__/. */
  baseline: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * Screenshots on the help pages. Each is a byte-for-byte copy of a committed Playwright baseline
 * (checked by itemGuide.test.ts), taken in answer mode, so no key shows. Decision 6, #269.
 */
export const HELP_FIGURES = {
  dropdownRationale: {
    src: "help/dropdown-rationale.png",
    baseline: "desktop-1280/dropdown-rationale.png",
    width: 1280,
    height: 1327,
    alt: "A Drop-Down Rationale item: a postpartum client’s findings, then the sentence “The client is most likely experiencing __ as evidenced by __ and __” with three unanswered drop-downs.",
  },
  bowtie: {
    src: "help/bowtie.png",
    baseline: "desktop-1280/bowtie.png",
    width: 1280,
    height: 1327,
    alt: "A Bowtie item: empty slots for two actions to take, one potential condition and two parameters to monitor, with the choices for each listed below them.",
  },
  caseStudy: {
    src: "help/case-study.png",
    baseline: "desktop-1280/case-study.png",
    width: 1280,
    height: 1327,
    alt: "Step 1 of 6 of a case study, Recognize Cues: the patient record on the left and a Highlight Text item on the right.",
  },
  trend: {
    src: "help/trend.png",
    baseline: "desktop-1280/trend.png",
    width: 1280,
    height: 1327,
    alt: "A Trend item: a patient record with a time selector for 0800, 1200 and 1600, beside a matrix asking whether each finding improved, is unchanged or declined.",
  },
  liveResults: {
    src: "help/live-results-sata.png",
    baseline: "desktop-1280/live-results-sata.png",
    width: 928,
    height: 469,
    alt: "Live results for a select-all-that-apply item: each option with a bar and a count such as 3 of 5, 60%, and a note that 1 student chose no option. Nothing is marked correct.",
  },
} as const satisfies Record<string, HelpFigure>;
