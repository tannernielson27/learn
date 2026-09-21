import { describe, expect, it } from "vitest";
import type { HighlightToken } from "./HighlightTokens";
import { explainedRuns, sentencesOf } from "./sentences";

const t = (value: string): HighlightToken => ({ kind: "text", value });
const s = (spanId: string, value: string): HighlightToken => ({ kind: "span", spanId, value });
const plain = (tokens: readonly HighlightToken[]) => tokens.map((token) => token.value).join("");

describe("sentencesOf", () => {
  it("ends a sentence only at a full stop followed by space or the end", () => {
    const tokens = [t("Temp 37.2 °C. Pain 2/10. "), s("a", "HR 54"), t(". Walked.")];
    expect(sentencesOf(tokens).map(plain)).toEqual([
      "Temp 37.2 °C.",
      " Pain 2/10.",
      " HR 54.",
      " Walked.",
    ]);
  });

  it("never ends a sentence inside a span, and keeps an unfinished sentence", () => {
    const tokens = [s("a", "Heart rate 54. Irregular"), t(", then "), s("b", "BP 128/78")];
    expect(sentencesOf(tokens)).toEqual([tokens]);
    expect(sentencesOf([])).toEqual([]);
  });

  it("loses no text", () => {
    const tokens = [t("A. "), s("x", "B"), t("! C? D")];
    expect(sentencesOf(tokens).map(plain).join("")).toBe(plain(tokens));
  });
});

describe("explainedRuns", () => {
  const tokens = [
    t("Intro. More intro. "),
    s("a", "A"),
    t(". "),
    s("b", "B"),
    t(" and "),
    s("c", "C"),
    t(". Tail."),
  ];

  it("ends a run after each sentence with an explained span, keeping the rest together", () => {
    const runs = explainedRuns(tokens, (id) => id !== "b");
    expect(runs.map((run) => plain(run.tokens))).toEqual([
      "Intro. More intro. A.",
      " B and C.",
      " Tail.",
    ]);
    expect(runs.map((run) => run.spans.map((span) => span.spanId))).toEqual([["a"], ["c"], []]);
  });

  it("is one run when nothing is explained", () => {
    expect(explainedRuns(tokens, () => false)).toEqual([{ tokens: expect.any(Array), spans: [] }]);
  });
});
