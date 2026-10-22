import { describe, expect, it } from "vitest";
import { matchesQuizSearch, quizSearchSummary } from "./quizSearch";

describe("matchesQuizSearch", () => {
  it("matches every quiz while nothing is typed", () => {
    expect(matchesQuizSearch("Cardiac week", "")).toBe(true);
    expect(matchesQuizSearch("Cardiac week", "   ")).toBe(true);
  });

  it("matches each typed word anywhere in the name, ignoring case and accents", () => {
    expect(matchesQuizSearch("Week 7: cardiac and respiratory", "cardiac")).toBe(true);
    expect(matchesQuizSearch("Week 7: cardiac and respiratory", "RESP week")).toBe(true);
    expect(matchesQuizSearch("Sepsis and shock", "cardiac")).toBe(false);
    expect(matchesQuizSearch("Pédiatrie", "pediatrie")).toBe(true);
  });
});

describe("quizSearchSummary", () => {
  it("says nothing until something is typed", () => {
    expect(quizSearchSummary(4, 4, " ")).toBeNull();
  });

  it("counts the quizzes that match", () => {
    expect(quizSearchSummary(1, 4, "card")).toBe("1 of 4 quizzes match “card”.");
    expect(quizSearchSummary(3, 4, "week")).toBe("3 of 4 quizzes match “week”.");
    expect(quizSearchSummary(0, 4, "renal")).toBe("No quizzes here match “renal”.");
  });
});
