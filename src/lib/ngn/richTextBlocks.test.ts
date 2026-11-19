import { describe, expect, it } from "vitest";
import { richTextBlocks } from "./richTextBlocks";

// #605: a question that refers to "the laboratory results above" carries the table in its stem.
const LAB = [
  "| Test | Result | Reference range |",
  "| --- | --- | --- |",
  "| Potassium | 3.0 mEq/L | 3.5 to 5.0 mEq/L |",
  "| Sodium | 138 mEq/L | 135 to 145 mEq/L |",
].join("\n");

describe("richTextBlocks", () => {
  it("splits paragraphs on blank lines, as before", () => {
    expect(richTextBlocks("One.\n\nTwo\nlines.")).toEqual([
      { kind: "paragraph", text: "One." },
      { kind: "paragraph", text: "Two\nlines." },
    ]);
  });

  it("reads a pipe table, with the question after it", () => {
    expect(richTextBlocks(`${LAB}\n\nWhich action should the nurse take first?`)).toEqual([
      {
        kind: "table",
        columns: ["Test", "Result", "Reference range"],
        rows: [
          ["Potassium", "3.0 mEq/L", "3.5 to 5.0 mEq/L"],
          ["Sodium", "138 mEq/L", "135 to 145 mEq/L"],
        ],
      },
      { kind: "paragraph", text: "Which action should the nurse take first?" },
    ]);
  });

  it("takes the outer pipes as optional and alignment colons in the rule", () => {
    expect(richTextBlocks("A | B\n:--- | ---:\n1 | 2")).toEqual([
      { kind: "table", columns: ["A", "B"], rows: [["1", "2"]] },
    ]);
  });

  it("pads a short row and drops cells past the header, so every row has the header's width", () => {
    expect(richTextBlocks("| A | B | C |\n| - | - | - |\n| 1 |\n| 1 | 2 | 3 | 4 |")).toEqual([
      {
        kind: "table",
        columns: ["A", "B", "C"],
        rows: [
          ["1", "", ""],
          ["1", "2", "3"],
        ],
      },
    ]);
  });

  it("keeps an escaped pipe inside a cell", () => {
    expect(richTextBlocks("| Value |\n| --- |\n| 3 \\| 4 |")).toEqual([
      { kind: "table", columns: ["Value"], rows: [["3 | 4"]] },
    ]);
  });

  it("parts a table from the question written right under it, with no blank line", () => {
    expect(richTextBlocks("| A | B |\n| --- | --- |\n| 1 | 2 |\nWhich is higher?")).toEqual([
      { kind: "table", columns: ["A", "B"], rows: [["1", "2"]] },
      { kind: "paragraph", text: "Which is higher?" },
    ]);
  });

  it("leaves text that only looks like a table as a paragraph", () => {
    for (const text of [
      "| A | B |\nno rule here",
      "| A | B |\n| --- | --- |",
      "Use a | to separate them.\n--- is a rule.\nok",
      "| A |\n| --- | --- |\n| 1 |",
    ]) {
      expect(richTextBlocks(text)).toEqual([{ kind: "paragraph", text }]);
    }
  });

  it("gives nothing for empty text", () => {
    expect(richTextBlocks("")).toEqual([]);
    expect(richTextBlocks("\n\n")).toEqual([]);
  });
});
