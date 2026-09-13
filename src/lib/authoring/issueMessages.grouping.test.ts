import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleResponseGroupingItemSchema } from "@/lib/ngn/schemas";
import { describeIssues } from "./issueMessages";

const base = FIXTURES.multiple_response_grouping.canonical;
const rows = base.content.rows;

function issuesFor(input: unknown) {
  const parsed = multipleResponseGroupingItemSchema.safeParse(input);
  if (parsed.success) throw new Error("expected the input to be invalid");
  return describeIssues(parsed.error.issues, "multiple_response_grouping");
}

describe("describeIssues (multiple response grouping)", () => {
  it("asks for at least two groups", () => {
    expect(
      issuesFor({
        ...base,
        content: { rows: rows.slice(0, 1) },
        answerKey: { rows: base.answerKey.rows.slice(0, 1) },
      }),
    ).toContainEqual({ field: "rows", message: "Add at least 2 groups." });
  });

  it("names the group that has no name", () => {
    const renamed = rows.map((row, index) => (index === 1 ? { ...row, label: "" } : row));
    expect(issuesFor({ ...base, content: { rows: renamed } })).toContainEqual({
      field: "rows.1.label",
      message: "Group 2 needs a name.",
    });
  });

  it("asks for at least two options in a group", () => {
    const thin = rows.map((row, index) =>
      index === 0 ? { ...row, options: row.options.slice(0, 1) } : row,
    );
    expect(issuesFor({ ...base, content: { rows: thin } })).toContainEqual({
      field: "rows.0.options",
      message: "Group 1 needs at least 2 options.",
    });
  });

  it("names the option that has no text by its group and letter", () => {
    const blankOption = rows.map((row, index) =>
      index === 0
        ? { ...row, options: row.options.map((o, i) => (i === 1 ? { ...o, label: "" } : o)) }
        : row,
    );
    expect(issuesFor({ ...base, content: { rows: blankOption } })).toContainEqual({
      field: "rows.0.options.1.label",
      message: "Group 1, option B needs text.",
    });
  });

  it("asks for a correct option in a group with nothing marked", () => {
    const keyRows = base.answerKey.rows.map((row, index) =>
      index === 0 ? { ...row, correctOptionIds: [] } : row,
    );
    expect(issuesFor({ ...base, answerKey: { rows: keyRows } })).toContainEqual({
      field: "rows.0.correct",
      message: "Mark at least one correct option in group 1.",
    });
  });

  it("never shows the generic fallback for these problems", () => {
    const keyRows = base.answerKey.rows.map((row) => ({ ...row, correctOptionIds: [] }));
    const messages = issuesFor({ ...base, answerKey: { rows: keyRows } }).map((i) => i.message);
    expect(messages.some((message) => message.startsWith("Something in this item"))).toBe(false);
  });
});
