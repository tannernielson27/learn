import type { EditorIssue, SchemaIssue } from "./issueMessages";

const FALLBACK = "Something in this record needs attention. Check each section.";

const place = (index: string) => Number(index) + 1;

/** One `ehrRecordSchema` issue in the record editor's words, pointing at the field to fix. */
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
    if (first === undefined)
      return { field: "timePoints", message: "Add at least one time point." };
    return {
      field: `timePoints.${first}.label`,
      message: `Time point ${place(first)} needs a label.`,
    };
  }

  if (area === "tabs") {
    if (first === undefined) {
      return { field: "tabs", message: "Add at least one section to the record." };
    }
    const section = `Section ${place(first)}`;
    if (part === "title")
      return { field: `tabs.${first}.title`, message: `${section} needs a title.` };
    if (part === "kind") {
      return {
        field: `tabs.${first}.kind`,
        message: `Choose a kind for section ${place(first)}.`,
      };
    }
    if (part === "timePointId") {
      return {
        field: `tabs.${first}.timePointId`,
        message: `${section} is charted at a time the record no longer has. Choose another time.`,
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
      if (blockPart === "value") return { field, message: `${block} needs text.` };
      if (blockPart === "columns") return { field, message: `${block} needs at least one column.` };
      if (blockPart === "rows") return { field, message: `${block} needs at least one row.` };
      return { field, message: `${block} needs attention.` };
    }
  }

  return { field: "record", message: FALLBACK };
}

/** Plain-language problems for a record, one per field, in the order the form shows them. */
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
