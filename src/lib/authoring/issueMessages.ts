/** What the editor shows for one problem: which form field, and what to do about it. */
export interface EditorIssue {
  /** Form field path, e.g. "stem", "options", "options.2.label", "correctOptionId". */
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

const FALLBACK = "Something in this item needs attention. Check the highlighted field.";

function letter(index: number): string {
  return String.fromCharCode(65 + index);
}

function describe(issue: SchemaIssue): EditorIssue {
  const path = issue.path.map(String);
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
  if (at === "answerKey.correctOptionId" || at === "answerKey") {
    return { field: "correctOptionId", message: "Choose the correct option." };
  }
  if (path[0] === "scoring") {
    return {
      field: "scoring",
      message: "The scoring settings are not valid. Reset them to the default.",
    };
  }
  return { field: path[0] ?? "item", message: FALLBACK };
}

/**
 * Turns schema issues into messages an instructor can act on, one per field. Schema messages are
 * written for developers ("correctOptionId must be one of the options") and never shown as-is.
 */
export function describeIssues(issues: readonly SchemaIssue[]): EditorIssue[] {
  const byField = new Map<string, EditorIssue>();
  for (const issue of issues) {
    const described = describe(issue);
    if (!byField.has(described.field)) byField.set(described.field, described);
  }
  return [...byField.values()];
}
