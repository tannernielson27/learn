import { describe, expect, it } from "vitest";
import { docxToMarkdown } from "./files/docx";
import { buildDocx, para, run, symbol, table } from "./files/testing/fixtures";
import { containsPassage, normalizePassage, openingKey } from "./sourceText";

describe("normalizePassage", () => {
  it("keeps the words and their order, and nothing else", () => {
    expect(normalizePassage("**A.** Assess the\\_airway — FIRST!")).toBe(
      "a assess the airway first",
    );
    expect(openingKey("One, two; three: four", 3)).toBe("one two three");
  });

  // #592: these marks hold letters, so they used to be read as words of the document.
  it.each([
    ["underline", "the <u>first</u> sign", "the first sign"],
    ["a line break in a cell", "Weight<br>today<br/>82 kg", "weight today 82 kg"],
    ["a named highlight", "==up 2.1 kg=={yellow} since", "up 2 1 kg since"],
    ["a shading fill", "==key=={#FFFF00} text", "key text"],
    ["a font colour", "==Assess=={color #C00000} first", "assess first"],
    ["highlight and colour", "==Assess=={yellow, color #C00000} first", "assess first"],
    ["a shaded cell", "| {shaded #D9D9D9} Yes | No |", "yes no"],
    [
      "a picture and a text box",
      "See [image]\n[text box]\nBP 132/84\n[/text box]",
      "see bp 132 84",
    ],
    ["an unreadable symbol", "Temp [symbol] 38", "temp 38"],
    ["strikethrough marks", "Give ~~two~~ three", "give two three"],
    ["bold, italic and their nesting", "~~***all***~~ of **it**", "all of it"],
  ])("ignores %s", (_, marked, plain) => {
    expect(normalizePassage(marked)).toBe(plain);
  });

  it("reads a raised number the same however it is written", () => {
    expect(normalizePassage("12 x 10³/mm³")).toBe("12 x 103 mm3");
    expect(normalizePassage("12 x 10^3/mm^3")).toBe("12 x 103 mm3");
    expect(normalizePassage("SpO₂ 91%")).toBe(normalizePassage("SpO2 91%"));
    // A caret that is not between two characters is punctuation like any other.
    expect(normalizePassage("up ^ down ^(a)")).toBe("up down a");
  });

  it("leaves words that only look like markup", () => {
    expect(normalizePassage("{yellow} and {shaded} and <b>bold</b>")).toBe(
      "yellow and shaded and b bold b",
    );
  });
});

describe("containsPassage", () => {
  // Every format the converter writes, in one fictional document, read by the real converter.
  const converted = docxToMarkdown(
    buildDocx({
      body:
        para(
          run("1. The nurse notes the "),
          run("first", { underline: true }),
          run(" sign of "),
          run("fluid overload", { highlight: "yellow" }),
          run(" in a client whose WBC is 12 x 10"),
          run("3", { vertical: "superscript" }),
          run(" and temperature "),
          symbol("Symbol", "F0B3"),
          run(" 38"),
          symbol("Symbol", "F0B0"),
          run("C."),
        ) +
        para(run("A. "), run("Restrict fluids", { colour: "C00000", bold: true })) +
        para(run("B. Give "), run("two", { strike: true }), run(" three litres")) +
        table([
          [
            { text: "Question", fill: "D9D9D9" },
            { text: "Answer", fill: "D9D9D9" },
          ],
          ["1", para(run("A. Restrict fluids")) + para(run("Rationale: fluid overload"))],
        ]),
    }),
  );
  const source = converted.ok ? converted.markdown : "";

  it("starts from markdown that holds every mark", () => {
    expect(source).toContain("<u>first</u>");
    expect(source).toContain("==fluid overload=={yellow}");
    expect(source).toContain("==**Restrict fluids**=={color #C00000}");
    expect(source).toContain("~~two~~");
    expect(source).toContain("{shaded #D9D9D9} Answer");
    expect(source).toContain("A. Restrict fluids<br>Rationale: fluid overload");
    expect(source).toContain("10³ and temperature ≥ 38°C.");
  });

  it("finds an underlined and highlighted stem copied as plain words", () => {
    const excerpt = "The nurse notes the first sign of fluid overload in a client whose WBC";
    expect(containsPassage(source, excerpt, 12)).toBe(true);
    expect(containsPassage(source, `${excerpt} is 12 x 10^3 and temperature ≥ 38°C.`)).toBe(true);
    expect(containsPassage(source, `${excerpt} is 12 x 10³ and temperature`)).toBe(true);
  });

  it("finds a stem copied with its markup, too", () => {
    expect(
      containsPassage(
        source,
        "The nurse notes the <u>first</u> sign of ==fluid overload=={yellow}",
      ),
    ).toBe(true);
  });

  it("finds a coloured, bold option and a struck-out one, with or without the struck words", () => {
    expect(containsPassage(source, "A. Restrict fluids")).toBe(true);
    expect(containsPassage(source, "B. Give two three litres")).toBe(true);
    expect(containsPassage(source, "B. Give three litres")).toBe(true);
    expect(containsPassage(source, "B. Give ~~two~~ three litres")).toBe(true);
  });

  it("finds an answer section that sits in a shaded table across a cell's lines", () => {
    expect(containsPassage(source, "A. Restrict fluids Rationale: fluid overload")).toBe(true);
    expect(containsPassage(source, "Question Answer 1 A. Restrict fluids")).toBe(true);
  });

  it("still refuses words the document does not have, markup or no markup", () => {
    expect(containsPassage(source, "The nurse notes the second sign of fluid overload", 12)).toBe(
      false,
    );
    expect(containsPassage(source, "A. Restrict fluids and sodium")).toBe(false);
    expect(containsPassage(source, "B. Give four litres")).toBe(false);
    expect(containsPassage(source, "<u></u> =={yellow} [image]")).toBe(false);
    expect(containsPassage(source, "yellow")).toBe(false);
    expect(containsPassage(source, "shaded")).toBe(false);
  });
});
