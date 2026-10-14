import { recordAtStep } from "@/lib/ngn/chartReveal";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { CASE_STUDY_STEPS } from "./forms/ehrSteps";
import type { EditorIssue, SchemaIssue } from "./issueMessages";

const FALLBACK = "Something in this patient record needs attention. Check each tab.";

const place = (index: string) => Number(index) + 1;

/** One `ehrRecordSchema` issue in the patient record editor's words, pointing at the field to fix. */
export function describeEhrIssue(issue: SchemaIssue): EditorIssue {
  const [area, first, part, blockIndex, blockPart, rowIndex, rowPart] = issue.path.map(String);

  if (area === "patientHeader") {
    if (first === "age") {
      return {
        field: "patient.age",
        message: "Enter the patient's age in whole years, from 0 to 120.",
      };
    }
    if (first === "sex") return { field: "patient.sex", message: "Choose the patient's sex." };
    if (first === "setting") {
      return { field: "patient.setting", message: "Write the care setting, such as Medical unit." };
    }
  }

  if (area === "timePoints") {
    // The record's own rule (#334): the time selector opens on a time point, so Step 1 needs one.
    if (first === undefined && issue.code === "custom") {
      return {
        field: "timePoints.0.fromStep",
        message: "One time point must show from Step 1. Set time point 1 to Step 1.",
      };
    }
    if (first === undefined)
      return { field: "timePoints", message: "Add at least one time point." };
    if (part === "fromStep") {
      return {
        field: `timePoints.${first}.fromStep`,
        message: `Time point ${place(first)} must show from one of Steps 1 to 6.`,
      };
    }
    return {
      field: `timePoints.${first}.label`,
      message: `Time point ${place(first)} needs a label.`,
    };
  }

  if (area === "tabs") {
    if (first === undefined) {
      return { field: "tabs", message: "Add at least one tab." };
    }
    const section = `Tab ${place(first)}`;
    if (part === "title")
      return { field: `tabs.${first}.title`, message: `${section} needs a title.` };
    if (part === "kind") {
      return {
        field: `tabs.${first}.kind`,
        message: `Choose a kind for tab ${place(first)}.`,
      };
    }
    if (part === "timePointId") {
      return {
        field: `tabs.${first}.timePointId`,
        message: `${section} is set to a time point that was removed. Choose another time.`,
      };
    }
    if (part === "stepAccess") {
      return {
        field: `tabs.${first}.stepAccess.0`,
        message: `${section} needs Hidden, Locked or Open for each of Steps 1 to 6.`,
      };
    }
    if (part === "blocks") {
      if (blockIndex === undefined) {
        return { field: `tabs.${first}.blocks`, message: `${section} needs at least one block.` };
      }
      const block = `${section}, block ${place(blockIndex)}`;
      const field = `tabs.${first}.blocks.${blockIndex}`;
      if (blockPart === "rows" && rowIndex !== undefined && rowPart !== undefined) {
        const row = `${block}, row ${place(rowIndex)}`;
        if (rowPart === "label") {
          return { field: `${field}.rows.${rowIndex}.label`, message: `${row} needs a measure.` };
        }
        if (rowPart === "value") {
          return { field: `${field}.rows.${rowIndex}.value`, message: `${row} needs a value.` };
        }
      }
      if (blockPart === "fromStep") {
        return {
          field: `${field}.fromStep`,
          message: `${block} must show from one of Steps 1 to 6.`,
        };
      }
      if (blockPart === "value") return { field, message: `${block} needs text.` };
      if (blockPart === "columns") return { field, message: `${block} needs at least one column.` };
      if (blockPart === "rows") return { field, message: `${block} needs at least one row.` };
      return { field, message: `${block} needs attention.` };
    }
  }

  return { field: "record", message: FALLBACK };
}

/**
 * Steps of a case study at which a student would see no tab at all (#336): every tab hidden, or
 * held back with its time point or blocks. The record allows it, but a chart with nothing in it is
 * a slip, so the editor says so, pointing at the first tab's control for that step.
 */
export function describeEmptySteps(record: EhrRecord): EditorIssue[] {
  return CASE_STUDY_STEPS.filter((step) => recordAtStep(record, step).tabs.length === 0).map(
    (step) => ({
      field: `tabs.0.stepAccess.${step - 1}`,
      message: `At Step ${step}, students see no tab.`,
    }),
  );
}

/** Plain-language problems for a patient record, one per field, in the order the form shows them. */
export function describeEhrIssues(issues: readonly SchemaIssue[]): EditorIssue[] {
  const seen = new Set<string>();
  const described: EditorIssue[] = [];
  for (const issue of issues) {
    const entry = describeEhrIssue(issue);
    if (seen.has(entry.field)) continue;
    seen.add(entry.field);
    described.push(entry);
  }
  return described;
}
