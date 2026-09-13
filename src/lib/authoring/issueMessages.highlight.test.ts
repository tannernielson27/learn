import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  emptyHighlightTableForm,
  emptyHighlightTextForm,
  fromHighlightTableForm,
  fromHighlightTextForm,
} from "@/lib/authoring/forms/highlight";
import { highlightTableItemSchema, highlightTextItemSchema } from "@/lib/ngn/schemas";
import { describeIssues } from "./issueMessages";

function problems(schema: z.ZodType, input: unknown, type: "highlight_text" | "highlight_table") {
  const parsed = schema.safeParse(input);
  if (parsed.success) return [];
  return describeIssues(parsed.error.issues, type);
}

const textForm = (passage: string, correctSpanIds: string[] = []) => ({
  ...emptyHighlightTextForm("ht_new"),
  stem: "Highlight the findings.",
  passage,
  correctSpanIds,
});

describe("highlight text problems", () => {
  it("asks for the passage when there is none", () => {
    expect(
      problems(highlightTextItemSchema, fromHighlightTextForm(textForm("")), "highlight_text"),
    ).toContainEqual({ field: "passage", message: "Write the passage." });
  });

  it("asks for at least two selectable phrases", () => {
    const input = fromHighlightTextForm(textForm("Only [[one|x]] here.", ["x"]));
    expect(problems(highlightTextItemSchema, input, "highlight_text")).toContainEqual({
      field: "passage",
      message: "Mark at least two selectable phrases, each with its own id.",
    });
  });

  it("asks for at least one correct phrase", () => {
    const input = fromHighlightTextForm(textForm("[[a|x]] and [[b|y]]"));
    expect(problems(highlightTextItemSchema, input, "highlight_text")).toContainEqual({
      field: "correctSpanIds",
      message: "Mark at least one phrase as correct.",
    });
  });

  it("has nothing to say about a valid item", () => {
    const input = fromHighlightTextForm(textForm("[[a|x]] and [[b|y]]", ["x"]));
    expect(problems(highlightTextItemSchema, input, "highlight_text")).toEqual([]);
  });
});

describe("highlight table problems", () => {
  it("asks for column headings by number", () => {
    const form = emptyHighlightTableForm("htb_new");
    const input = fromHighlightTableForm({ ...form, stem: "Highlight." });
    expect(problems(highlightTableItemSchema, input, "highlight_table")).toContainEqual({
      field: "columns.0.label",
      message: "Column 1 needs a heading.",
    });
  });

  const labelled = () => ({
    ...emptyHighlightTableForm("htb_new"),
    stem: "Highlight.",
    columns: [{ label: "System" }, { label: "Findings" }],
  });

  it("asks for a correct phrase", () => {
    const input = fromHighlightTableForm(labelled());
    expect(problems(highlightTableItemSchema, input, "highlight_table")).toContainEqual({
      field: "correctSpanIds",
      message: "Mark at least one phrase as correct.",
    });
  });

  // Zod runs the whole-item check only once the item's shape is otherwise valid.
  it("asks for at least two selectable phrases in the table", () => {
    const form = labelled();
    const input = fromHighlightTableForm({
      ...form,
      rows: [{ id: "row_1", cells: [{ text: "Skin" }, { text: "[[dry lips|x]]" }] }],
      correctSpanIds: ["x"],
    });
    expect(problems(highlightTableItemSchema, input, "highlight_table")).toContainEqual({
      field: "rows",
      message: "Mark at least two selectable phrases, each with its own id.",
    });
  });
});
