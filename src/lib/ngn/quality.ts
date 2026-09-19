import { spanIdsOf, type Item, type Labeled } from "./schemas";

/**
 * Quality checks an author sees beside an item's problems (spec §6). They never make an item
 * invalid; all but a missing rationale are advice. A missing `rationale.general` blocks publishing
 * (owner decision, 2026-09-19), so it is also returned by `publishBlockers`.
 */
export type ItemWarningCode =
  | "rationale_missing"
  | "sata_all_correct"
  | "sata_option_rationale_missing"
  | "highlight_mostly_correct"
  | "stem_not_question"
  | "duplicate_option_text";

export interface ItemWarning {
  code: ItemWarningCode;
  /** Where in the item the warning points, e.g. ["content", "options", 2, "label"]. */
  path: (string | number)[];
  /** Plain words an instructor can act on. */
  message: string;
}

/** More than this share of highlightable phrases marked correct gives the answer away (spec §6). */
const HIGHLIGHT_CORRECT_SHARE = 0.6;

const letter = (index: number) => String.fromCharCode(65 + index);

const hasText = (value: { value: string } | undefined): boolean =>
  value !== undefined && value.value.trim().length > 0;

/** Words that tell a student what to do when a stem is phrased as an instruction, not a question. */
const DIRECTIVE =
  /\b(select|choose|complete|click|highlight|drag|fill|place|order|arrange|rank|indicate|identify|specify|determine|match|mark|sort|prioritize|put)\b/i;

/** Whether a stem asks a question or says what to do. */
export function stemAsksSomething(stem: string): boolean {
  return stem.includes("?") || DIRECTIVE.test(stem);
}

const normalized = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();

/** One warning for each entry whose text repeats an earlier one in the same list. */
function duplicates(
  list: readonly Labeled[],
  path: (string | number)[],
  noun: (index: number) => string,
): ItemWarning[] {
  const firstIndex = new Map<string, number>();
  const warnings: ItemWarning[] = [];
  list.forEach((entry, index) => {
    const key = normalized(entry.label);
    const earlier = firstIndex.get(key);
    if (key === "") return;
    if (earlier === undefined) {
      firstIndex.set(key, index);
      return;
    }
    const later = noun(index);
    warnings.push({
      code: "duplicate_option_text",
      path: [...path, index, "label"],
      message: `${later[0].toUpperCase()}${later.slice(1)} reads the same as ${noun(earlier)}. Reword one of them.`,
    });
  });
  return warnings;
}

function duplicateWarnings(item: Item): ItemWarning[] {
  const option = (index: number) => `option ${letter(index)}`;
  switch (item.type) {
    case "multiple_choice":
    case "multiple_response":
      return duplicates(item.content.options, ["content", "options"], option);
    case "multiple_response_grouping":
      return item.content.rows.flatMap((row, r) =>
        duplicates(
          row.options,
          ["content", "rows", r, "options"],
          (i) => `group ${r + 1}, option ${letter(i)}`,
        ),
      );
    case "matrix_multiple_choice":
    case "matrix_multiple_response":
      return [
        ...duplicates(item.content.rows, ["content", "rows"], (i) => `row ${i + 1}`),
        ...duplicates(item.content.columns, ["content", "columns"], (i) => `column ${i + 1}`),
      ];
    case "dropdown_table":
      return item.content.rows.flatMap((row, r) =>
        duplicates(
          row.choices,
          ["content", "rows", r, "choices"],
          (i) => `row ${r + 1}, choice ${letter(i)}`,
        ),
      );
    case "dropdown_cloze":
    case "dropdown_rationale":
      return item.content.blanks.flatMap((blank, b) =>
        duplicates(
          blank.choices,
          ["content", "blanks", b, "choices"],
          (i) => `blank ${b + 1}, choice ${letter(i)}`,
        ),
      );
    case "dragdrop_cloze":
    case "dragdrop_rationale":
      return duplicates(item.content.bank, ["content", "bank"], (i) => `word ${i + 1}`);
    case "ordered_response":
      return duplicates(item.content.items, ["content", "items"], (i) => `step ${i + 1}`);
    case "bowtie":
      return [
        ...duplicates(item.content.actions, ["content", "actions"], (i) => `action ${i + 1}`),
        ...duplicates(
          item.content.conditions,
          ["content", "conditions"],
          (i) => `condition ${i + 1}`,
        ),
        ...duplicates(
          item.content.parameters,
          ["content", "parameters"],
          (i) => `parameter ${i + 1}`,
        ),
      ];
    default:
      return [];
  }
}

function sataWarnings(item: Item): ItemWarning[] {
  if (item.type !== "multiple_response" || item.content.variant !== "sata") return [];
  const warnings: ItemWarning[] = [];
  const options = item.content.options;
  if (item.answerKey.correctOptionIds.length === options.length) {
    warnings.push({
      code: "sata_all_correct",
      path: ["answerKey", "correctOptionIds"],
      message: "Every option is marked correct. Leave at least one wrong option to choose against.",
    });
  }
  const perElement = item.rationale.perElement ?? {};
  const unexplained = options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => !hasText(perElement[option.id]));
  if (unexplained.length > 0) {
    const letters = unexplained.map(({ index }) => letter(index));
    const named =
      letters.length === 1
        ? `option ${letters[0]} is`
        : `options ${letters.slice(0, -1).join(", ")} and ${letters.at(-1)} are`;
    warnings.push({
      code: "sata_option_rationale_missing",
      path: ["content", "options", unexplained[0].index, "rationale"],
      message: `Explain why ${named} right or wrong.`,
    });
  }
  return warnings;
}

function highlightWarnings(item: Item): ItemWarning[] {
  if (item.type !== "highlight_text" && item.type !== "highlight_table") return [];
  const spanCount =
    item.type === "highlight_text"
      ? spanIdsOf(item.content.passage).length
      : item.content.rows.reduce(
          (n, r) => n + r.cells.reduce((m, c) => m + spanIdsOf(c).length, 0),
          0,
        );
  if (item.answerKey.correctSpanIds.length <= spanCount * HIGHLIGHT_CORRECT_SHARE) return [];
  return [
    {
      code: "highlight_mostly_correct",
      path: ["answerKey", "correctSpanIds"],
      message: "More than 60% of the phrases are marked correct. Mark fewer, or add phrases.",
    },
  ];
}

const RATIONALE_MISSING: ItemWarning = {
  code: "rationale_missing",
  path: ["rationale", "general"],
  message: "Write a rationale. An item needs one before it can be published.",
};

/** What must be fixed before an otherwise valid item may be published: only a missing rationale. */
export function publishBlockers(item: Item): ItemWarning[] {
  return hasText(item.rationale.general)
    ? []
    : [{ ...RATIONALE_MISSING, path: ["rationale", "general"] }];
}

/** Every quality warning for a valid item, in the order its fields appear in the editor. */
export function itemQualityWarnings(item: Item): ItemWarning[] {
  const stem: ItemWarning[] = stemAsksSomething(item.stem.value)
    ? []
    : [
        {
          code: "stem_not_question",
          path: ["stem"],
          message: "The stem does not ask anything. End it with a question or say what to do.",
        },
      ];
  return [
    ...stem,
    ...duplicateWarnings(item),
    ...sataWarnings(item),
    ...highlightWarnings(item),
    ...publishBlockers(item),
  ];
}
