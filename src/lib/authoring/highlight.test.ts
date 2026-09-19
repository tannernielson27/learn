import { describe, expect, it } from "vitest";
import {
  excerptSegments,
  hasMatch,
  MARK_END,
  MARK_START,
  splitHighlight,
  type Segment,
} from "./highlight";

const marked = (word: string) => `${MARK_START}${word}${MARK_END}`;
const text = (segments: readonly Segment[]) => segments.map((segment) => segment.text).join("");

describe("splitHighlight", () => {
  it("splits marked words from the text around them", () => {
    expect(splitHighlight(`A rising ${marked("lactate")} and ${marked("lactates")}.`)).toEqual([
      { text: "A rising ", match: false },
      { text: "lactate", match: true },
      { text: " and ", match: false },
      { text: "lactates", match: true },
      { text: ".", match: false },
    ]);
  });

  it("reads text without markers as one unmatched segment, and nothing as none", () => {
    expect(splitHighlight("Which action comes first?")).toEqual([
      { text: "Which action comes first?", match: false },
    ]);
    expect(splitHighlight("")).toEqual([]);
  });

  it("keeps HTML as text, to be rendered escaped", () => {
    expect(splitHighlight(`<b>${marked("<i>x</i>")}</b>`)).toEqual([
      { text: "<b>", match: false },
      { text: "<i>x</i>", match: true },
      { text: "</b>", match: false },
    ]);
  });

  it("marks the rest after a start with no end, and ignores a stray end", () => {
    expect(splitHighlight(`a${MARK_END}b ${MARK_START}c`)).toEqual([
      { text: "ab ", match: false },
      { text: "c", match: true },
    ]);
  });

  it("joins neighbours of one kind, so adjacent marks read as one", () => {
    expect(splitHighlight(`${marked("serum")}${marked("lactate")}`)).toEqual([
      { text: "serumlactate", match: true },
    ]);
  });
});

describe("hasMatch", () => {
  it("is true only when a segment is marked", () => {
    expect(hasMatch(splitHighlight(`a ${marked("b")}`))).toBe(true);
    expect(hasMatch(splitHighlight("a b"))).toBe(false);
  });
});

describe("excerptSegments", () => {
  it("reads markdown as plain text and closes up whitespace across segments", () => {
    const segments = splitHighlight(`**Which** rising\n\n_${marked("lactate")}_ value?`);
    expect(excerptSegments(segments)).toEqual([
      { text: "Which rising ", match: false },
      { text: "lactate", match: true },
      { text: " value?", match: false },
    ]);
  });

  it("shortens from the start when the first match fits", () => {
    const segments = splitHighlight(`A ${marked("lactate")} ${"word ".repeat(60)}`);
    const excerpt = excerptSegments(segments, 40);
    expect(text(excerpt).length).toBeLessThanOrEqual(40);
    expect(text(excerpt).startsWith("A lactate")).toBe(true);
    expect(text(excerpt).endsWith("…")).toBe(true);
  });

  it("starts near the first match when it would fall past the end", () => {
    const segments = splitHighlight(`${"word ".repeat(60)}the ${marked("lactate")} rose sharply`);
    const excerpt = excerptSegments(segments, 40);
    expect(text(excerpt).length).toBeLessThanOrEqual(40);
    expect(text(excerpt).startsWith("…")).toBe(true);
    expect(excerpt.some((segment) => segment.match && segment.text === "lactate")).toBe(true);
  });

  it("returns nothing for text that is only markdown or space", () => {
    expect(excerptSegments(splitHighlight("** __ \n"))).toEqual([]);
  });
});
