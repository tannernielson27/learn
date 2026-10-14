import { describe, expect, it } from "vitest";
import {
  isMarkedCell,
  letterOf,
  normalizeLine,
  normalizeMarkdown,
  parseAnswer,
  parseScoringRule,
  readMarked,
  statedSelectCount,
} from "./text";

describe("normalizeLine", () => {
  it("straightens smart quotes and collapses whitespace", () => {
    expect(normalizeLine("  The client’s  “baseline” weight\t ")).toBe(
      `The client's "baseline" weight`,
    );
  });
});

describe("normalizeMarkdown", () => {
  it("keeps paragraph breaks but collapses spaces and extra blank lines", () => {
    expect(normalizeMarkdown("First  line\r\n\r\n\r\n  Second  line  ")).toBe(
      "First line\n\nSecond line",
    );
  });
});

describe("readMarked", () => {
  it.each([
    ["Heart rate 118 *", "Heart rate 118"],
    ["Heart rate 118*", "Heart rate 118"],
    ["* Heart rate 118", "Heart rate 118"],
    ["*Heart rate 118", "Heart rate 118"],
    ["✅ Heart rate 118", "Heart rate 118"],
    ["Heart rate 118 ✅", "Heart rate 118"],
    ["✔️ Heart rate 118", "Heart rate 118"],
    ["✅ Heart rate 118 *", "Heart rate 118"],
  ])("reads %j as marked", (raw, text) => {
    expect(readMarked(raw)).toEqual({ text, marked: true });
  });

  it("leaves unmarked text alone apart from whitespace and quotes", () => {
    expect(readMarked("  Client’s heart rate ")).toEqual({
      text: "Client's heart rate",
      marked: false,
    });
  });

  it("does not take markdown emphasis for a mark", () => {
    expect(readMarked("Do *not* ambulate")).toEqual({ text: "Do *not* ambulate", marked: false });
    expect(readMarked("*Not* indicated")).toEqual({ text: "*Not* indicated", marked: false });
    expect(readMarked("Do *not* ambulate *")).toEqual({
      text: "Do *not* ambulate",
      marked: true,
    });
  });
});

describe("isMarkedCell", () => {
  it.each(["*", " * ", "X", "x", "✅", "✓"])("%j is a mark", (cell) => {
    expect(isMarkedCell(cell)).toBe(true);
  });
  it.each(["", "  ", "☐", "-", "No"])("%j is not a mark", (cell) => {
    expect(isMarkedCell(cell)).toBe(false);
  });
});

describe("parseAnswer", () => {
  const labels = ["Apple", "Banana", "Cherry", "Date"];

  it.each([
    ["Answer: ✅ B.", [1]],
    ["B", [1]],
    ["(b)", [1]],
    ["A, C and D", [0, 2, 3]],
    ["Answers: A; C", [0, 2]],
    ["C → A → D → B", [2, 0, 3, 1]],
    ["Correct order: 3, 1, 4, 2", [2, 0, 3, 1]],
    ["Banana", [1]],
    ["Answer: cherry.", [2]],
    ["Cherry; Apple", [2, 0]],
  ])("reads %j", (answer, expected) => {
    expect(parseAnswer(answer, labels)).toEqual(expected);
  });

  it.each(["", "Answer:", "F", "E, A", "Kiwi", "5"])("refuses %j", (answer) => {
    expect(parseAnswer(answer, labels)).toBeUndefined();
  });
});

describe("statedSelectCount", () => {
  it.each([
    ["Which 4 findings require follow-up?", 4],
    ["Which three interventions are priorities?", 3],
    ["Select the 3 priority interventions.", 3],
    ["Choose two actions.", 2],
  ])("reads %j", (text, n) => {
    expect(statedSelectCount(text)).toBe(n);
  });

  it("is undefined for select all that apply, even when a number appears", () => {
    expect(statedSelectCount("Which 2 findings?", "Select all that apply.")).toBeUndefined();
  });

  it("is undefined when no count is stated", () => {
    expect(statedSelectCount("Which findings require follow-up?", undefined)).toBeUndefined();
  });
});

describe("parseScoringRule", () => {
  it.each([
    ["Scoring Rule: +/-", "plus_minus"],
    ["Scoring rule: +/−", "plus_minus"],
    ["plus/minus", "plus_minus"],
    ["Scoring Rule: 0/1", "zero_one"],
    ["zero-one", "zero_one"],
    ["Scoring Rule: Rationale", "rationale"],
    ["Triad", "rationale"],
    ["0/1 per position", "position"],
  ])("reads %j", (stated, rule) => {
    expect(parseScoringRule(stated)).toBe(rule);
  });

  it("is undefined for words it does not know", () => {
    expect(parseScoringRule("Partial credit")).toBeUndefined();
  });
});

describe("letterOf", () => {
  it("counts from A", () => {
    expect([0, 1, 9].map(letterOf)).toEqual(["A", "B", "J"]);
  });
});
