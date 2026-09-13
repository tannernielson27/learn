import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import {
  matrixMultipleChoiceItemSchema,
  matrixMultipleResponseItemSchema,
} from "@/lib/ngn/schemas";
import {
  emptyMatrixForm,
  fromMatrixMultipleChoiceForm,
  fromMatrixMultipleResponseForm,
  toMatrixForm,
} from "./matrix";

const parseMc = (input: unknown) => matrixMultipleChoiceItemSchema.parse(input);
const parseMr = (input: unknown) => matrixMultipleResponseItemSchema.parse(input);

describe("matrix form mapping", () => {
  it.each([
    ["canonical", FIXTURES.matrix_multiple_choice.canonical],
    ["edge", FIXTURES.matrix_multiple_choice.edge],
  ])("round-trips the matrix multiple choice %s fixture", (_name, input) => {
    const item = parseMc(input);
    expect(parseMc(fromMatrixMultipleChoiceForm(toMatrixForm(item)))).toEqual(item);
  });

  it.each([
    ["canonical", FIXTURES.matrix_multiple_response.canonical],
    ["edge", FIXTURES.matrix_multiple_response.edge],
  ])("round-trips the matrix multiple response %s fixture", (_name, input) => {
    const item = parseMr(input);
    expect(parseMr(fromMatrixMultipleResponseForm(toMatrixForm(item)))).toEqual(item);
  });

  it("keeps each row's correct columns and rationale on the row", () => {
    const form = toMatrixForm(parseMr(FIXTURES.matrix_multiple_response.canonical));
    expect(form.rows[2]).toMatchObject({ id: "row_glucose", correctColumnIds: ["col_hypo"] });
    expect(form.rows[2].rationale).toMatch(/glucose of 48/);
  });

  it("scores matrix multiple choice one point per row", () => {
    const form = toMatrixForm(parseMc(FIXTURES.matrix_multiple_choice.canonical));
    expect(fromMatrixMultipleChoiceForm(form).scoring).toEqual({ model: "zero_one", maxPoints: 5 });
  });

  it("scores matrix multiple response one point per correct cell", () => {
    const form = toMatrixForm(parseMr(FIXTURES.matrix_multiple_response.canonical));
    expect(fromMatrixMultipleResponseForm(form).scoring).toEqual({
      model: "plus_minus",
      maxPoints: 7,
    });
  });

  it("writes one answer-key row per row, in row order, even with nothing marked", () => {
    const form = emptyMatrixForm("mx_new");
    const mc = fromMatrixMultipleChoiceForm(form);
    const mr = fromMatrixMultipleResponseForm(form);
    expect(mc.answerKey.rows.map((row) => row.rowId)).toEqual(form.rows.map((row) => row.id));
    expect(mr.answerKey.rows.map((row) => row.rowId)).toEqual(form.rows.map((row) => row.id));
  });

  it("starts a new grid with two blank rows and two blank columns, invalid until filled in", () => {
    const form = emptyMatrixForm("mx_new");
    expect(form.rows).toHaveLength(2);
    expect(form.columns).toHaveLength(2);
    const ids = [...form.rows.map((row) => row.id), ...form.columns.map((column) => column.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      matrixMultipleChoiceItemSchema.safeParse(fromMatrixMultipleChoiceForm(form)).success,
    ).toBe(false);
    expect(
      matrixMultipleResponseItemSchema.safeParse(fromMatrixMultipleResponseForm(form)).success,
    ).toBe(false);
  });
});
