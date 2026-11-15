import { describe, expect, it } from "vitest";
import { QUESTION_EXCERPT_LENGTH, questionLabel } from "./questionLabel";

describe("questionLabel", () => {
  it("names a question by its number and its text", () => {
    expect(questionLabel(3, "Which finding needs follow-up?")).toEqual({
      number: "Q3",
      excerpt: "Which finding needs follow-up?",
      full: "Q3 Which finding needs follow-up?",
    });
  });

  it("reads the markdown stem as plain text on one line", () => {
    const label = questionLabel(1, "**Which** findings\n\nneed _follow-up_?");
    expect(label.excerpt).toBe("Which findings need follow-up?");
    expect(label.full).toBe("Q1 Which findings need follow-up?");
  });

  it("cuts a long stem to about 60 characters with an ellipsis, keeping all of it in full", () => {
    const stem =
      "A client with heart failure gained 2.3 kg (5 lb) in two days and reports shortness of breath at night. Which action comes first?";
    const label = questionLabel(15, stem);
    expect(label.excerpt.length).toBeLessThanOrEqual(QUESTION_EXCERPT_LENGTH);
    expect(label.excerpt.endsWith("…")).toBe(true);
    expect(stem.startsWith(label.excerpt.slice(0, -1))).toBe(true);
    expect(label.full).toBe(`Q15 ${stem}`);
  });

  it("does not cut a stem of exactly the limit", () => {
    const stem = "x".repeat(QUESTION_EXCERPT_LENGTH);
    expect(questionLabel(1, stem).excerpt).toBe(stem);
  });

  it("cuts one long word mid-word rather than showing nothing", () => {
    const word = "pneumonoultramicroscopicsilicovolcanoconiosis".repeat(3);
    const label = questionLabel(2, word);
    expect(label.excerpt).toHaveLength(QUESTION_EXCERPT_LENGTH);
    expect(label.excerpt).toBe(`${word.slice(0, QUESTION_EXCERPT_LENGTH - 1)}…`);
  });

  it.each([[""], ["   \n "], [null], [undefined]])(
    "falls back to the number alone for an empty stem (%j)",
    (stem) => {
      expect(questionLabel(4, stem)).toEqual({ number: "Q4", excerpt: "", full: "Q4" });
    },
  );

  it("takes a shorter limit where a caller asks for one", () => {
    expect(questionLabel(1, "Which finding needs follow-up?", 10).excerpt).toBe("Which fin…");
  });
});
