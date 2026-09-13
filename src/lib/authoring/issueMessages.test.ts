import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { describeIssues } from "./issueMessages";

const multipleChoiceFixture = FIXTURES.multiple_choice;

const base = multipleChoiceFixture.canonical;

function issuesFor(input: unknown) {
  const parsed = multipleChoiceItemSchema.safeParse(input);
  if (parsed.success) throw new Error("expected the input to be invalid");
  return describeIssues(parsed.error.issues);
}

describe("describeIssues (multiple choice)", () => {
  it("asks for a stem", () => {
    expect(issuesFor({ ...base, stem: { kind: "markdown", value: "" } })).toContainEqual({
      field: "stem",
      message: "Write the question stem.",
    });
  });

  it("asks for more options when there are too few", () => {
    const options = base.content.options.slice(0, 3);
    expect(
      issuesFor({ ...base, content: { options }, answerKey: { correctOptionId: options[0].id } }),
    ).toContainEqual({ field: "options", message: "Add at least 4 options." });
  });

  it("caps the number of options", () => {
    const options = Array.from({ length: 7 }, (_, i) => ({ id: `opt_${i}`, label: `Option ${i}` }));
    expect(
      issuesFor({ ...base, content: { options }, answerKey: { correctOptionId: "opt_0" } }),
    ).toContainEqual({ field: "options", message: "Use at most 6 options." });
  });

  it("names the option that has no text by its letter", () => {
    const options = base.content.options.map((o, i) => (i === 2 ? { ...o, label: "" } : o));
    expect(issuesFor({ ...base, content: { options } })).toContainEqual({
      field: "options.2.label",
      message: "Option C needs text.",
    });
  });

  it("asks for a correct answer when none of the options is marked", () => {
    expect(issuesFor({ ...base, answerKey: { correctOptionId: "opt_missing" } })).toContainEqual({
      field: "correctOptionId",
      message: "Choose the correct option.",
    });
  });

  it("never shows a raw schema path or developer message", () => {
    const messages = [
      ...issuesFor({ ...base, stem: { kind: "markdown", value: "" } }),
      ...issuesFor({ ...base, answerKey: { correctOptionId: "opt_missing" } }),
      ...issuesFor({ ...base, scoring: { model: "zero_one", maxPoints: 0 } }),
      ...issuesFor({ ...base, id: "has spaces" }),
    ].map((issue) => issue.message);
    for (const message of messages) {
      expect(message).not.toMatch(/answerKey|correctOptionId|content\.|maxPoints|invalid id/);
      expect(message).toMatch(/^[A-Z]/);
      expect(message.endsWith(".")).toBe(true);
    }
  });

  it("returns one message per field, even when the schema reports a field twice", () => {
    const result = issuesFor({ ...base, stem: { kind: "markdown", value: "" } });
    const fields = result.map((issue) => issue.field);
    expect(new Set(fields).size).toBe(fields.length);
  });
});
