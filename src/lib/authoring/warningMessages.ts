import type { ItemType } from "@/lib/ngn/labels";
import { itemQualityWarnings, type ItemWarning } from "@/lib/ngn/quality";
import type { Item } from "@/lib/ngn/schemas";
import { describeIssues, type EditorIssue } from "./issueMessages";

/** The form field every editor keeps its general rationale in. */
export const RATIONALE_FIELD = "rationaleGeneral";

const RATIONALE_MESSAGE = "Write the rationale. An item needs one before it can be published.";

/**
 * The editor field a warning points at. Content and key paths are the ones the schema reports
 * problems at, so they map to fields exactly as problems do; rationale has its own fields.
 */
export function warningField(path: ItemWarning["path"], type: ItemType): string {
  const at = path.map(String);
  if (at[0] === "rationale") return RATIONALE_FIELD;
  if (at[0] === "content" && at[1] === "options" && at[3] === "rationale") {
    return `options.${at[2]}.rationale`;
  }
  const [described] = describeIssues([{ code: "custom", path, message: "" }], type);
  return described?.field ?? at[0] ?? "item";
}

/** Warnings the editor words elsewhere: a missing rationale is a problem to fix (it blocks
 * publishing), and the highlight editors already say how many phrases are correct beside them. */
const SHOWN_ELSEWHERE = new Set<ItemWarning["code"]>([
  "rationale_missing",
  "highlight_mostly_correct",
]);

/** Advice for a valid item, one message per field, as the editor lists it beside Problems to fix. */
export function editorWarnings(item: Item): EditorIssue[] {
  const byField = new Map<string, EditorIssue>();
  for (const warning of itemQualityWarnings(item)) {
    if (SHOWN_ELSEWHERE.has(warning.code)) continue;
    const field = warningField(warning.path, item.type);
    if (!byField.has(field)) byField.set(field, { field, message: warning.message });
  }
  return [...byField.values()];
}

/** The problem a blank rationale raises in the editor, from the item input the form builds. */
export function rationaleProblem(
  rationale: { general?: { value: string } } | undefined,
): EditorIssue | null {
  const written = (rationale?.general?.value ?? "").trim().length > 0;
  return written ? null : { field: RATIONALE_FIELD, message: RATIONALE_MESSAGE };
}
