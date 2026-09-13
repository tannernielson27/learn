import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleResponseGroupingItemSchema } from "@/lib/ngn/schemas";
import { emptyGroupingForm, fromGroupingForm, toGroupingForm } from "./multipleResponseGrouping";

const fixture = FIXTURES.multiple_response_grouping;
const parse = (input: unknown) => multipleResponseGroupingItemSchema.parse(input);

describe("multiple response grouping form mapping", () => {
  it.each([
    ["canonical", fixture.canonical],
    ["edge", fixture.edge],
  ])("round-trips the %s fixture: item -> form -> item", (_name, input) => {
    const item = parse(input);
    expect(parse(fromGroupingForm(toGroupingForm(item)))).toEqual(item);
  });

  it("marks correctness on each option inside its row", () => {
    const item = parse(fixture.canonical);
    const form = toGroupingForm(item);
    for (const row of form.rows) {
      const key = item.answerKey.rows.find((keyRow) => keyRow.rowId === row.id);
      const marked = row.options.filter((option) => option.correct).map((option) => option.id);
      expect(marked.sort()).toEqual([...(key?.correctOptionIds ?? [])].sort());
    }
  });

  it("writes one answer-key row per group, in group order, even when a group has nothing marked", () => {
    const form = toGroupingForm(parse(fixture.canonical));
    const cleared = {
      ...form,
      rows: form.rows.map((row, index) =>
        index === 0
          ? { ...row, options: row.options.map((option) => ({ ...option, correct: false })) }
          : row,
      ),
    };
    const input = fromGroupingForm(cleared);
    expect(input.answerKey.rows.map((row) => row.rowId)).toEqual(form.rows.map((row) => row.id));
    expect(input.answerKey.rows[0].correctOptionIds).toEqual([]);
    expect(multipleResponseGroupingItemSchema.safeParse(input).success).toBe(false);
  });

  it("starts a new item with two groups of two blank options", () => {
    const form = emptyGroupingForm("mrg_new");
    expect(form.rows).toHaveLength(2);
    expect(form.rows.every((row) => row.options.length === 2 && row.label === "")).toBe(true);
    const allIds = form.rows.flatMap((row) => [row.id, ...row.options.map((option) => option.id)]);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(multipleResponseGroupingItemSchema.safeParse(fromGroupingForm(form)).success).toBe(
      false,
    );
  });
});
