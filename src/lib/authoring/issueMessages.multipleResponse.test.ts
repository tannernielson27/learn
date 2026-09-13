import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleResponseItemSchema } from "@/lib/ngn/schemas";
import { describeIssues } from "./issueMessages";

const base = FIXTURES.multiple_response.canonical;

function issuesFor(input: unknown, context: { n?: number } = {}) {
  const parsed = multipleResponseItemSchema.safeParse(input);
  if (parsed.success) throw new Error("expected the input to be invalid");
  // The Select N count comes from the form: zod issues do not carry it.
  return describeIssues(parsed.error.issues, "multiple_response", context);
}

describe("describeIssues (multiple response)", () => {
  it("asks for at least five options", () => {
    const options = base.content.options.slice(0, 4);
    expect(
      issuesFor({
        ...base,
        content: { ...base.content, options },
        answerKey: { correctOptionIds: [options[0].id] },
      }),
    ).toContainEqual({ field: "options", message: "Add at least 5 options." });
  });

  it("asks for at least one correct option, not a single one", () => {
    expect(issuesFor({ ...base, answerKey: { correctOptionIds: [] } })).toContainEqual({
      field: "correctOptionIds",
      message: "Mark at least one option as correct.",
    });
  });

  it("asks for a Select N count that is fewer than the options", () => {
    expect(
      issuesFor({ ...base, content: { ...base.content, variant: "select_n", n: 99 } }),
    ).toContainEqual({
      field: "n",
      message: "Choose how many options to select. It must be fewer than the number of options.",
    });
  });

  it("asks for exactly N correct options on Select N", () => {
    const n = 2;
    expect(
      issuesFor(
        {
          ...base,
          content: { ...base.content, variant: "select_n", n },
          answerKey: { correctOptionIds: [base.content.options[0].id] },
        },
        { n },
      ),
    ).toContainEqual({ field: "correctOptionIds", message: "Mark exactly 2 options as correct." });
  });

  it("never falls back to the single-answer wording", () => {
    const messages = issuesFor({ ...base, answerKey: { correctOptionIds: [] } }).map(
      (issue) => issue.message,
    );
    expect(messages).not.toContain("Choose the correct option.");
  });
});
