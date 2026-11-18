import { describe, expect, it } from "vitest";
import { marksIn, pagesLabel, parseSource, sourceLegend } from "./sourceMarkup";

describe("parseSource", () => {
  it("leaves plain text as it is", () => {
    expect(parseSource("A. Assess the airway\nB. Give oxygen *")).toEqual([
      { kind: "text", text: "A. Assess the airway\nB. Give oxygen *" },
    ]);
    expect(parseSource("")).toEqual([]);
  });

  it("reads bold, underline and strike-through", () => {
    expect(parseSource("A. **Yogurt** or <u>milk</u>, not ~~tea~~.")).toEqual([
      { kind: "text", text: "A. " },
      { kind: "bold", children: [{ kind: "text", text: "Yogurt" }] },
      { kind: "text", text: " or " },
      { kind: "underline", children: [{ kind: "text", text: "milk" }] },
      { kind: "text", text: ", not " },
      { kind: "struck", children: [{ kind: "text", text: "tea" }] },
      { kind: "text", text: "." },
    ]);
  });

  it("tells a highlight from font colour, and reads both together", () => {
    expect(parseSource("==B. Yogurt=={yellow}")).toEqual([
      { kind: "highlight", children: [{ kind: "text", text: "B. Yogurt" }] },
    ]);
    expect(parseSource("==C=={#FFFF00}")[0]).toMatchObject({ kind: "highlight" });
    expect(parseSource("==D=={color #C00000}")).toEqual([
      { kind: "coloured", children: [{ kind: "text", text: "D" }] },
    ]);
    expect(parseSource("==E=={yellow, color #C00000}")).toEqual([
      {
        kind: "highlight",
        children: [{ kind: "coloured", children: [{ kind: "text", text: "E" }] }],
      },
    ]);
  });

  it("reads marks inside marks", () => {
    expect(parseSource("**<u>Expected</u>**")).toEqual([
      {
        kind: "bold",
        children: [{ kind: "underline", children: [{ kind: "text", text: "Expected" }] }],
      },
    ]);
  });

  it("reads a shaded cell and a cell's line break", () => {
    expect(parseSource("| {shaded #D9D9D9} X | one<br>two |")).toEqual([
      { kind: "text", text: "| " },
      { kind: "shaded" },
      { kind: "text", text: " X | one" },
      { kind: "break" },
      { kind: "text", text: "two |" },
    ]);
  });

  it("leaves a mark that is not closed, and anything that only looks like markup, as text", () => {
    const loose = "**not closed, <u>nor this, ==nor this, <script>alert(1)</script>";
    expect(parseSource(loose)).toEqual([{ kind: "text", text: loose }]);
    expect(parseSource("a ** b\n** c")).toEqual([{ kind: "text", text: "a ** b\n** c" }]);
  });
});

describe("sourceLegend", () => {
  it("explains only the marks whose look is not the document's own", () => {
    expect(sourceLegend(parseSource("**bold** and <u>underlined</u>"))).toBeNull();
    expect(sourceLegend(parseSource("==a=={yellow}"))).toBe("A highlight is the document's own.");
    expect(sourceLegend(parseSource("==a=={color #C00000} {shaded #D9D9D9}"))).toBe(
      "A dotted underline is coloured text. “Shaded” marks a shaded line or cell.",
    );
  });

  it("finds a mark inside another", () => {
    expect([...marksIn(parseSource("**==a=={color #C00000}**"))].sort()).toEqual([
      "bold",
      "coloured",
    ]);
  });
});

describe("pagesLabel", () => {
  it("names one page or a range", () => {
    expect(pagesLabel({ from: 4, to: 4 })).toBe("page 4");
    expect(pagesLabel({ from: 3, to: 10 })).toBe("pages 3 to 10");
  });
});
