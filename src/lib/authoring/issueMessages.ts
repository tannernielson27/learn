import type { ItemType } from "@/lib/ngn/labels";

/** What the editor shows for one problem: which form field, and what to do about it. */
export interface EditorIssue {
  /** Form field path, e.g. "stem", "options", "options.2.label", "correctOptionId", "n". */
  field: string;
  message: string;
}

/** The subset of a zod 4 issue this mapper reads. */
export interface SchemaIssue {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
}

/** Values from the form that some messages quote, such as the Select N count. */
export interface IssueContext {
  n?: number;
}

type Describer = (
  issue: SchemaIssue,
  path: string[],
  context: IssueContext,
) => EditorIssue | undefined;

const FALLBACK = "Something in this item needs attention. Check the highlighted field.";

const letter = (index: number) => String.fromCharCode(65 + index);

/** Wording shared by every selection-style item. */
const describeShared: Describer = (issue, path) => {
  const at = path.join(".");
  if (at === "stem" || at === "stem.value") {
    return { field: "stem", message: "Write the question stem." };
  }
  if (at === "content.options") {
    if (issue.code === "too_small") {
      return { field: "options", message: `Add at least ${issue.minimum} options.` };
    }
    if (issue.code === "too_big") {
      return { field: "options", message: `Use at most ${issue.maximum} options.` };
    }
    return { field: "options", message: "Two options are the same. Remove one of them." };
  }
  if (path[0] === "content" && path[1] === "options" && path[3] === "label") {
    const index = Number(path[2]);
    return { field: `options.${index}.label`, message: `Option ${letter(index)} needs text.` };
  }
  if (path[0] === "scoring") {
    return {
      field: "scoring",
      message: "The scoring settings are not valid. Reset them to the default.",
    };
  }
  return undefined;
};

const describeMultipleChoice: Describer = (_issue, path) => {
  const at = path.join(".");
  if (at === "answerKey" || at === "answerKey.correctOptionId") {
    return { field: "correctOptionId", message: "Choose the correct option." };
  }
  return undefined;
};

const describeMultipleResponse: Describer = (issue, path, context) => {
  if (path.join(".") === "content.n") {
    return {
      field: "n",
      message: "Choose how many options to select. It must be fewer than the number of options.",
    };
  }
  if (path[0] === "answerKey") {
    // The schema's Select N refinement is the only answer-key issue that mentions "exactly".
    if (/exactly/.test(issue.message) && context.n !== undefined) {
      return {
        field: "correctOptionIds",
        message: `Mark exactly ${context.n} options as correct.`,
      };
    }
    return { field: "correctOptionIds", message: "Mark at least one option as correct." };
  }
  return undefined;
};

const describeGrouping: Describer = (issue, path) => {
  const at = path.join(".");
  if (at === "content.rows") {
    if (issue.code === "too_big") {
      return { field: "rows", message: `Use at most ${issue.maximum} groups.` };
    }
    return { field: "rows", message: `Add at least ${issue.minimum ?? 2} groups.` };
  }
  if (path[0] === "content" && path[1] === "rows") {
    const group = Number(path[2]) + 1;
    if (path[3] === "label") {
      return { field: `rows.${path[2]}.label`, message: `Group ${group} needs a name.` };
    }
    if (path[3] === "options" && path.length === 4) {
      return issue.code === "too_big"
        ? {
            field: `rows.${path[2]}.options`,
            message: `Group ${group} can have at most ${issue.maximum} options.`,
          }
        : {
            field: `rows.${path[2]}.options`,
            message: `Group ${group} needs at least ${issue.minimum ?? 2} options.`,
          };
    }
    if (path[3] === "options" && path[5] === "label") {
      return {
        field: `rows.${path[2]}.options.${path[4]}.label`,
        message: `Group ${group}, option ${letter(Number(path[4]))} needs text.`,
      };
    }
  }
  if (path[0] === "answerKey" && path[1] === "rows" && path[2] !== undefined) {
    const group = Number(path[2]) + 1;
    return {
      field: `rows.${path[2]}.correct`,
      message: `Mark at least one correct option in group ${group}.`,
    };
  }
  if (path[0] === "answerKey") {
    return { field: "rows", message: "Mark the correct options in every group." };
  }
  return undefined;
};

/** "Add at least N …" or "Use at most N …", from the counts zod reports. */
const countMessage = (
  issue: SchemaIssue,
  field: string,
  noun: string,
  fallbackMin: number,
): EditorIssue =>
  issue.code === "too_big"
    ? { field, message: `Use at most ${issue.maximum} ${noun}.` }
    : { field, message: `Add at least ${issue.minimum ?? fallbackMin} ${noun}.` };

const describeMatrix: Describer = (issue, path) => {
  const at = path.join(".");
  if (at === "content.rows") return countMessage(issue, "rows", "rows", 2);
  if (at === "content.columns") return countMessage(issue, "columns", "columns", 2);
  if (path[0] === "content" && path[1] === "rows" && path[3] === "label") {
    return { field: `rows.${path[2]}.label`, message: `Row ${Number(path[2]) + 1} needs text.` };
  }
  if (path[0] === "content" && path[1] === "columns" && path[3] === "label") {
    return {
      field: `columns.${path[2]}.label`,
      message: `Column ${Number(path[2]) + 1} needs a heading.`,
    };
  }
  if (path[0] === "answerKey" && path[1] === "rows" && path[2] !== undefined) {
    const row = Number(path[2]) + 1;
    // Matrix multiple response reports an empty list; matrix multiple choice a missing id.
    return path[3] === "correctColumnIds"
      ? {
          field: `rows.${path[2]}.correct`,
          message: `Mark at least one correct column for row ${row}.`,
        }
      : { field: `rows.${path[2]}.correct`, message: `Choose the correct column for row ${row}.` };
  }
  if (path[0] === "answerKey") {
    return { field: "rows", message: "Every row needs its correct answer marked." };
  }
  return undefined;
};

const describeDropdownTable: Describer = (issue, path) => {
  const at = path.join(".");
  if (at === "content.columns.label") {
    return { field: "columnLabel", message: "Name the row heading." };
  }
  if (at === "content.columns.dropdown") {
    return { field: "dropdownLabel", message: "Name the drop-down heading." };
  }
  if (at === "content.rows") return countMessage(issue, "rows", "rows", 2);
  if (path[0] === "content" && path[1] === "rows") {
    const row = Number(path[2]) + 1;
    if (path[3] === "label") {
      return { field: `rows.${path[2]}.label`, message: `Row ${row} needs text.` };
    }
    if (path[3] === "choices" && path.length === 4) {
      return issue.code === "too_big"
        ? {
            field: `rows.${path[2]}.choices`,
            message: `Row ${row} can have at most ${issue.maximum} choices.`,
          }
        : {
            field: `rows.${path[2]}.choices`,
            message: `Row ${row} needs at least ${issue.minimum ?? 2} choices.`,
          };
    }
    if (path[3] === "choices" && path[5] === "label") {
      return {
        field: `rows.${path[2]}.choices.${path[4]}.label`,
        message: `Row ${row}, choice ${letter(Number(path[4]))} needs text.`,
      };
    }
  }
  if (path[0] === "answerKey" && path[1] === "rows" && path[2] !== undefined) {
    return {
      field: `rows.${path[2]}.correct`,
      message: `Choose the correct choice for row ${Number(path[2]) + 1}.`,
    };
  }
  if (path[0] === "answerKey") {
    return { field: "rows", message: "Every row needs its correct choice." };
  }
  return undefined;
};

const describeCloze: Describer = (issue, path) => {
  const at = path.join(".");
  if (at === "content.tokens") {
    if (issue.code === "too_small") return { field: "sentence", message: "Write the sentence." };
    const range = /expected (\d+)\D+(\d+) blanks/.exec(issue.message);
    return {
      field: "sentence",
      message: range
        ? `Put ${range[1]} to ${range[2]} blanks in the sentence.`
        : "Check the blanks in the sentence.",
    };
  }
  if (at === "content.blanks") {
    if (issue.code === "custom") {
      return { field: "sentence", message: "Each blank must appear in the sentence exactly once." };
    }
    return countMessage(issue, "blanks", "blanks", 1);
  }
  if (path[0] === "content" && path[1] === "blanks") {
    const blankNumber = Number(path[2]) + 1;
    if (path[3] === "choices" && path.length === 4) {
      return issue.code === "too_big"
        ? {
            field: `blanks.${path[2]}.choices`,
            message: `Blank ${blankNumber} can have at most ${issue.maximum} choices.`,
          }
        : {
            field: `blanks.${path[2]}.choices`,
            message: `Blank ${blankNumber} needs at least ${issue.minimum ?? 3} choices.`,
          };
    }
    if (path[3] === "choices" && path[5] === "label") {
      return {
        field: `blanks.${path[2]}.choices.${path[4]}.label`,
        message: `Blank ${blankNumber}, choice ${letter(Number(path[4]))} needs text.`,
      };
    }
  }
  if (at === "answerKey.anchorBlankId") {
    return { field: "anchorBlankId", message: "Choose which blank is the anchor." };
  }
  if (path[0] === "answerKey" && path[1] === "blanks" && path[2] !== undefined) {
    return {
      field: `blanks.${path[2]}.correct`,
      message: `Choose the correct choice for blank ${Number(path[2]) + 1}.`,
    };
  }
  if (path[0] === "answerKey") {
    return { field: "blanks", message: "Every blank needs its correct choice." };
  }
  return undefined;
};

const DESCRIBERS: Partial<Record<ItemType, Describer>> = {
  multiple_choice: describeMultipleChoice,
  multiple_response: describeMultipleResponse,
  multiple_response_grouping: describeGrouping,
  matrix_multiple_choice: describeMatrix,
  matrix_multiple_response: describeMatrix,
  dropdown_table: describeDropdownTable,
  dropdown_cloze: describeCloze,
  dropdown_rationale: describeCloze,
};

/**
 * Turns schema issues into messages an instructor can act on, one per field. Schema messages are
 * written for developers ("correctOptionIds must be options") and are never shown as they are.
 */
export function describeIssues(
  issues: readonly SchemaIssue[],
  type: ItemType = "multiple_choice",
  context: IssueContext = {},
): EditorIssue[] {
  const specific = DESCRIBERS[type];
  const byField = new Map<string, EditorIssue>();
  for (const issue of issues) {
    const path = issue.path.map(String);
    const described = specific?.(issue, path, context) ??
      describeShared(issue, path, context) ?? { field: path[0] ?? "item", message: FALLBACK };
    // A field keeps its first message: the schema reports the most basic problem first.
    if (!byField.has(described.field)) byField.set(described.field, described);
  }
  return [...byField.values()];
}
