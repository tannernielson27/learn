import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import {
  dropdownClozeItemSchema,
  dropdownRationaleItemSchema,
  dropdownTableItemSchema,
  matrixMultipleChoiceItemSchema,
  matrixMultipleResponseItemSchema,
} from "@/lib/ngn/schemas";
import { clozeFormFromStored, emptyClozeForm, toClozeForm } from "./cloze";
import { parseClozeDraft } from "./clozeDraft";
import { DRAFT_ERROR } from "./draft";
import {
  dropdownTableFormFromStored,
  emptyDropdownTableForm,
  toDropdownTableForm,
} from "./dropdownTable";
import { parseDropdownTableDraft } from "./dropdownTableDraft";
import { emptyMatrixForm, matrixFormFromStored, toMatrixForm } from "./matrix";
import { parseMatrixDraft } from "./matrixDraft";

const ROW_ID = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const fresh = (type: string) => ({
  type,
  stem: { kind: "markdown", value: "" },
  answerKey: {},
  scoring: {},
  tags: [],
  version: 1,
});

describe("matrix: stored drafts and draft checks", () => {
  it("opens complete items of both matrix types exactly as the mapping would", () => {
    const mc = matrixMultipleChoiceItemSchema.parse(FIXTURES.matrix_multiple_choice.canonical);
    const mr = matrixMultipleResponseItemSchema.parse(FIXTURES.matrix_multiple_response.canonical);
    expect(matrixFormFromStored(mc, ROW_ID)).toEqual(toMatrixForm(mc));
    expect(matrixFormFromStored(mr, ROW_ID)).toEqual(toMatrixForm(mr));
  });

  it("opens a brand-new draft as a blank grid named by its row", () => {
    expect(matrixFormFromStored(fresh("matrix_multiple_choice"), ROW_ID)).toEqual(
      emptyMatrixForm(ROW_ID),
    );
  });

  it("keeps a half-written grid, including marks from either answer-key shape", () => {
    const partial = {
      type: "matrix_multiple_choice",
      stem: { kind: "markdown", value: "For each intervention…" },
      content: {
        rows: [{ id: "row_1", label: "Keep NPO" }],
        columns: [
          { id: "col_1", label: "Indicated" },
          { id: "col_2", label: "" },
        ],
      },
      answerKey: { rows: [{ rowId: "row_1", correctColumnId: "col_1" }] },
    };
    const form = matrixFormFromStored(partial, ROW_ID);
    expect(form.rows).toEqual([
      { id: "row_1", label: "Keep NPO", correctColumnIds: ["col_1"], rationale: "" },
    ]);
    expect(form.columns.map((column) => column.label)).toEqual(["Indicated", ""]);
  });

  it("ignores malformed pieces instead of throwing", () => {
    expect(matrixFormFromStored({ content: { rows: "x", columns: [3] } }, ROW_ID)).toEqual(
      emptyMatrixForm(ROW_ID),
    );
  });

  it("accepts a blank form and a complete one, and refuses extra fields and oversized grids", () => {
    const complete = toMatrixForm(
      matrixMultipleResponseItemSchema.parse(FIXTURES.matrix_multiple_response.edge),
    );
    expect(parseMatrixDraft(emptyMatrixForm(ROW_ID)).ok).toBe(true);
    expect(parseMatrixDraft(complete)).toEqual({ ok: true, values: complete });
    const blank = emptyMatrixForm(ROW_ID);
    for (const bad of [
      { ...blank, answerKey: {} },
      {
        ...blank,
        rows: Array.from({ length: 9 }, (_, i) => ({
          id: `r${i}`,
          label: "",
          correctColumnIds: [],
          rationale: "",
        })),
      },
      { ...blank, columns: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, label: "" })) },
      { ...blank, stem: "a".repeat(20_001) },
    ]) {
      expect(parseMatrixDraft(bad)).toEqual({ ok: false, error: DRAFT_ERROR });
    }
  });
});

describe("dropdown table: stored drafts and draft checks", () => {
  it("opens a complete table exactly as the mapping would", () => {
    const item = dropdownTableItemSchema.parse(FIXTURES.dropdown_table.edge);
    expect(dropdownTableFormFromStored(item, ROW_ID)).toEqual(toDropdownTableForm(item));
  });

  it("opens a brand-new draft as a blank table", () => {
    expect(dropdownTableFormFromStored(fresh("dropdown_table"), ROW_ID)).toEqual(
      emptyDropdownTableForm(ROW_ID),
    );
  });

  it("keeps a half-written table's headings, rows, choices and chosen answer", () => {
    const partial = {
      type: "dropdown_table",
      content: {
        columns: { label: "Medication", dropdown: "" },
        rows: [
          {
            id: "row_1",
            label: "Digoxin",
            choices: [
              { id: "row_1_a", label: "Check apical pulse" },
              { id: "row_1_b", label: "" },
            ],
          },
        ],
      },
      answerKey: { rows: [{ rowId: "row_1", correctChoiceId: "row_1_a" }] },
    };
    const form = dropdownTableFormFromStored(partial, ROW_ID);
    expect(form).toMatchObject({ columnLabel: "Medication", dropdownLabel: "" });
    expect(form.rows).toEqual([
      {
        id: "row_1",
        label: "Digoxin",
        choices: [
          { id: "row_1_a", label: "Check apical pulse" },
          { id: "row_1_b", label: "" },
        ],
        correctChoiceId: "row_1_a",
      },
    ]);
  });

  it("accepts a blank form and a complete one, and refuses extra fields and oversized rows", () => {
    const complete = toDropdownTableForm(
      dropdownTableItemSchema.parse(FIXTURES.dropdown_table.canonical),
    );
    expect(parseDropdownTableDraft(emptyDropdownTableForm(ROW_ID)).ok).toBe(true);
    expect(parseDropdownTableDraft(complete)).toEqual({ ok: true, values: complete });
    const blank = emptyDropdownTableForm(ROW_ID);
    const wideRow = {
      ...blank.rows[0],
      choices: Array.from({ length: 7 }, (_, i) => ({ id: `row_1_${i}`, label: "" })),
    };
    for (const bad of [
      { ...blank, answerKey: {} },
      { ...blank, rows: [wideRow] },
      { ...blank, columnLabel: "a".repeat(2_001) },
    ]) {
      expect(parseDropdownTableDraft(bad)).toEqual({ ok: false, error: DRAFT_ERROR });
    }
  });
});

describe("cloze: stored drafts and draft checks", () => {
  it("opens complete cloze and rationale items exactly as the mapping would", () => {
    const cloze = dropdownClozeItemSchema.parse(FIXTURES.dropdown_cloze.canonical);
    const triad = dropdownRationaleItemSchema.parse(FIXTURES.dropdown_rationale.canonical);
    expect(clozeFormFromStored(cloze, ROW_ID)).toEqual(toClozeForm(cloze));
    expect(clozeFormFromStored(triad, ROW_ID)).toEqual(toClozeForm(triad));
  });

  it("opens a brand-new draft as a blank sentence", () => {
    expect(clozeFormFromStored(fresh("dropdown_cloze"), ROW_ID)).toEqual(emptyClozeForm(ROW_ID));
  });

  it("keeps a half-written sentence, its blanks, choices, answers and anchor", () => {
    const partial = {
      type: "dropdown_rationale",
      content: {
        tokens: [
          { kind: "text", value: "The client has " },
          { kind: "blank", blankId: "blank_1" },
        ],
        blanks: [{ id: "blank_1", choices: [{ id: "blank_1_a", label: "hemorrhage" }] }],
      },
      answerKey: {
        anchorBlankId: "blank_1",
        blanks: [{ blankId: "blank_1", correctChoiceId: "blank_1_a" }],
      },
    };
    const form = clozeFormFromStored(partial, ROW_ID);
    expect(form.sentence).toBe("The client has {{blank_1}}");
    expect(form.anchorBlankId).toBe("blank_1");
    expect(form.blanks).toEqual([
      {
        id: "blank_1",
        choices: [{ id: "blank_1_a", label: "hemorrhage" }],
        correctChoiceId: "blank_1_a",
        rationale: "",
      },
    ]);
  });

  it("ignores malformed tokens instead of throwing", () => {
    const junk = {
      content: { tokens: [{ kind: "blank" }, 7, { kind: "text", value: 3 }], blanks: "x" },
    };
    expect(clozeFormFromStored(junk, ROW_ID)).toEqual(emptyClozeForm(ROW_ID));
  });

  it("accepts a blank form and a complete one, and refuses extra fields and oversized sentences", () => {
    const complete = toClozeForm(
      dropdownRationaleItemSchema.parse(FIXTURES.dropdown_rationale.canonical),
    );
    expect(parseClozeDraft(emptyClozeForm(ROW_ID)).ok).toBe(true);
    expect(parseClozeDraft(complete)).toEqual({ ok: true, values: complete });
    const blank = emptyClozeForm(ROW_ID);
    for (const bad of [
      { ...blank, answerKey: {} },
      { ...blank, sentence: "a".repeat(20_001) },
      { ...blank, blanks: Array.from({ length: 4 }, () => blank.blanks[0]) },
    ]) {
      expect(parseClozeDraft(bad)).toEqual({ ok: false, error: DRAFT_ERROR });
    }
  });
});
