import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { rowsFromPractice } from "@/lib/practice/resultsRows";
import type { ResultEntry } from "./results";
import { rowsFromResults } from "./resultsRows";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const score = (points: number) => ({
  points,
  maxPoints: 1,
  model: "zero_one" as const,
  breakdown: [],
});

describe("rowsFromResults", () => {
  it("reads a mark, a blank and an unreadable answer, in the set's order", () => {
    const entries: ResultEntry[] = [
      {
        rowId: "a",
        item: MC,
        outcome: {
          kind: "answered",
          response: { type: "multiple_choice", optionId: "opt_a" },
          score: score(0),
        },
      },
      { rowId: "b", item: MC, outcome: { kind: "not_answered" } },
      { rowId: "c", item: MC, outcome: { kind: "unreadable" } },
    ];
    const rows = rowsFromResults(entries);
    expect(rows.map((row) => [row.number, row.verdict])).toEqual([
      [1, "none"],
      [2, "unanswered"],
      [3, "unreadable"],
    ]);
    expect(rows[1]?.maxPoints).toBe(MC.scoring.maxPoints);
    expect(rows[0]?.step).toBe(MC.cjmmStep ?? null);
  });
});

describe("rowsFromPractice", () => {
  it("reads the marks sent back with each answer; a key with no marks cannot be read", () => {
    const keyless = toKeylessItem(MC);
    const rows = rowsFromPractice(
      [
        { kind: "item", itemId: "a", item: keyless, answered: null },
        { kind: "item", itemId: "b", item: keyless, answered: null },
        { kind: "item", itemId: "c", item: keyless, answered: null },
      ],
      {
        a: {
          kind: "scored",
          response: { type: "multiple_choice", optionId: "opt_a" },
          reveal: {
            score: score(1),
            answerKey: MC.answerKey,
            rationale: MC.rationale,
            scoring: MC.scoring,
          },
        },
        b: {
          kind: "key",
          key: { answerKey: MC.answerKey, rationale: MC.rationale, scoring: MC.scoring },
        },
      },
    );
    expect(rows.map((row) => row.verdict)).toEqual(["full", "unreadable", "unanswered"]);
  });
});
