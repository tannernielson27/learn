import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { highlightTableItemSchema, highlightTextItemSchema } from "@/lib/ngn/schemas";
import {
  emptyHighlightTableForm,
  emptyHighlightTextForm,
  highlightTableFormFromStored,
  highlightTextFormFromStored,
  toHighlightTableForm,
  toHighlightTextForm,
} from "./highlight";
import { parseHighlightTableDraft, parseHighlightTextDraft } from "./highlightDraft";

describe("highlightTextFormFromStored", () => {
  it("opens a complete stored item exactly", () => {
    const item = highlightTextItemSchema.parse(FIXTURES.highlight_text.canonical);
    expect(highlightTextFormFromStored(item, "row-id")).toEqual(toHighlightTextForm(item));
  });

  it("keeps a draft's well-formed passage and correct marks", () => {
    const stored = {
      id: "ht_draft",
      stem: { kind: "markdown", value: "Highlight it." },
      content: {
        passage: [
          { kind: "text", value: "A " },
          { kind: "span", spanId: "x", value: "fever" },
          { kind: "bogus" },
        ],
      },
      answerKey: { correctSpanIds: ["x", 7] },
    };
    const form = highlightTextFormFromStored(stored, "row-id");
    expect(form.id).toBe("ht_draft");
    expect(form.stem).toBe("Highlight it.");
    expect(form.passage).toBe("A [[fever|x]]");
    expect(form.correctSpanIds).toEqual(["x"]);
  });

  it.each([null, "text", 42, []])("starts blank from unusable input %j", (stored) => {
    expect(highlightTextFormFromStored(stored, "row-id")).toEqual(emptyHighlightTextForm("row-id"));
  });
});

describe("highlightTableFormFromStored", () => {
  it("opens a complete stored item exactly", () => {
    const item = highlightTableItemSchema.parse(FIXTURES.highlight_table.canonical);
    expect(highlightTableFormFromStored(item, "row-id")).toEqual(toHighlightTableForm(item));
  });

  it("keeps a draft's columns and rows, and starts blank from nonsense", () => {
    const stored = {
      id: "htb_draft",
      content: {
        columns: ["System", "Findings"],
        rows: [{ id: "r1", cells: [[{ kind: "text", value: "Skin" }], "not tokens"] }],
        scorePerRow: true,
      },
    };
    const form = highlightTableFormFromStored(stored, "row-id");
    expect(form.columns.map((column) => column.label)).toEqual(["System", "Findings"]);
    expect(form.rows).toEqual([{ id: "r1", cells: [{ text: "Skin" }, { text: "" }] }]);
    expect(form.scorePerRow).toBe(true);
    expect(highlightTableFormFromStored(undefined, "row-id")).toEqual(
      emptyHighlightTableForm("row-id"),
    );
  });
});

describe("highlight draft schemas", () => {
  it("accept every fixture's form and a blank form", () => {
    for (const input of [FIXTURES.highlight_text.canonical, FIXTURES.highlight_text.edge]) {
      const form = toHighlightTextForm(highlightTextItemSchema.parse(input));
      expect(parseHighlightTextDraft(form)).toEqual({ ok: true, values: form });
    }
    for (const input of [FIXTURES.highlight_table.canonical, FIXTURES.highlight_table.edge]) {
      const form = toHighlightTableForm(highlightTableItemSchema.parse(input));
      expect(parseHighlightTableDraft(form)).toEqual({ ok: true, values: form });
    }
    expect(parseHighlightTextDraft(emptyHighlightTextForm("ht_new")).ok).toBe(true);
    expect(parseHighlightTableDraft(emptyHighlightTableForm("htb_new")).ok).toBe(true);
  });

  it("refuse unknown fields, oversized text and too many rows", () => {
    const text = emptyHighlightTextForm("ht_new");
    expect(parseHighlightTextDraft({ ...text, answerKey: {} }).ok).toBe(false);
    expect(parseHighlightTextDraft({ ...text, passage: "x".repeat(20_001) }).ok).toBe(false);
    const table = emptyHighlightTableForm("htb_new");
    const rows = Array.from({ length: 9 }, (_, index) => ({
      id: `r${index}`,
      cells: [{ text: "" }, { text: "" }],
    }));
    expect(parseHighlightTableDraft({ ...table, rows }).ok).toBe(false);
  });
});
