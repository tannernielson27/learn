import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { dropdownTableItemSchema } from "@/lib/ngn/schemas";
import {
  emptyDropdownTableForm,
  fromDropdownTableForm,
  toDropdownTableForm,
} from "./dropdownTable";

const parse = (input: unknown) => dropdownTableItemSchema.parse(input);

describe("dropdown table form mapping", () => {
  it.each([
    ["canonical", FIXTURES.dropdown_table.canonical],
    ["edge", FIXTURES.dropdown_table.edge],
  ])("round-trips the %s fixture: item -> form -> item", (_name, input) => {
    const item = parse(input);
    expect(parse(fromDropdownTableForm(toDropdownTableForm(item)))).toEqual(item);
  });

  it("marks each row's correct choice on the row", () => {
    const form = toDropdownTableForm(parse(FIXTURES.dropdown_table.canonical));
    expect(form.rows.map((row) => row.correctChoiceId)).toEqual(["dig_a", "ins_a", "met_a"]);
    expect(form).toMatchObject({ columnLabel: "Medication", dropdownLabel: "Nursing action" });
  });

  it("scores one point per row", () => {
    const form = toDropdownTableForm(parse(FIXTURES.dropdown_table.canonical));
    expect(fromDropdownTableForm(form).scoring).toEqual({ model: "zero_one", maxPoints: 3 });
  });

  it("writes one answer-key row per table row, in order, even with nothing chosen", () => {
    const form = emptyDropdownTableForm("ddt_new");
    const input = fromDropdownTableForm(form);
    expect(input.answerKey.rows.map((row) => row.rowId)).toEqual(form.rows.map((row) => row.id));
  });

  it("starts a new table with two blank rows of two blank choices, invalid until filled in", () => {
    const form = emptyDropdownTableForm("ddt_new");
    expect(form.rows).toHaveLength(2);
    expect(form.rows.every((row) => row.choices.length === 2 && row.correctChoiceId === "")).toBe(
      true,
    );
    const ids = form.rows.flatMap((row) => [row.id, ...row.choices.map((choice) => choice.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(dropdownTableItemSchema.safeParse(fromDropdownTableForm(form)).success).toBe(false);
  });
});
