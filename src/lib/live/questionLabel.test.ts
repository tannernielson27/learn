import { describe, expect, it } from "vitest";
import { QUESTION_EXCERPT_LENGTH, questionText } from "./questionLabel";

describe("questionText (#563)", () => {
  it("gives the start of the question and the whole of it", () => {
    expect(questionText("Which finding needs follow-up?")).toEqual({
      excerpt: "Which finding needs follow-up?",
      full: "Which finding needs follow-up?",
    });
  });

  it("strips markdown marks and joins lines", () => {
    expect(questionText("**Which** findings\n\nneed _follow-up_?").full).toBe(
      "Which findings need follow-up?",
    );
  });

  it("cuts a long question with an ellipsis and keeps the whole of it for the tooltip", () => {
    const stem =
      "A client with heart failure gained two kilograms overnight and reports new orthopnea this morning.";
    const text = questionText(stem);
    expect(text.excerpt.endsWith("…")).toBe(true);
    expect(text.excerpt.length).toBeLessThanOrEqual(QUESTION_EXCERPT_LENGTH);
    expect(text.full).toBe(stem);
  });

  it("cuts a single long word rather than leaving nothing", () => {
    expect(questionText("x".repeat(90)).excerpt.length).toBeGreaterThan(0);
  });

  it.each([null, undefined, "", "   \n "])("gives nothing for %j", (stem) => {
    expect(questionText(stem)).toEqual({ excerpt: "", full: "" });
  });

  it("takes a shorter limit", () => {
    expect(questionText("Which finding needs follow-up?", 10).excerpt).toBe("Which fin…");
  });
});
