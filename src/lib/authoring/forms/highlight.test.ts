import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { highlightTableItemSchema, highlightTextItemSchema } from "@/lib/ngn/schemas";
import {
  emptyHighlightTableForm,
  emptyHighlightTextForm,
  fromHighlightTableForm,
  fromHighlightTextForm,
  highlightWarning,
  markSpan,
  nextSpanId,
  passageToTokens,
  pruneAnswers,
  spansInTable,
  spansInText,
  toHighlightTableForm,
  toHighlightTextForm,
  tokensToPassage,
  unmarkSpan,
} from "./highlight";

const parseText = (input: unknown) => highlightTextItemSchema.parse(input);
const parseTable = (input: unknown) => highlightTableItemSchema.parse(input);

describe("passage markup", () => {
  it.each([
    ["highlight text canonical", FIXTURES.highlight_text.canonical.content.passage],
    ["highlight text edge", FIXTURES.highlight_text.edge.content.passage],
  ])("turns %s tokens into marked text and back unchanged", (_name, tokens) => {
    expect(passageToTokens(tokensToPassage(tokens))).toEqual(tokens);
  });

  it("writes a span as [[phrase|id]] between the surrounding text", () => {
    expect(
      tokensToPassage([
        { kind: "text", value: "Note: " },
        { kind: "span", spanId: "sp_hr", value: "heart rate 54" },
        { kind: "text", value: "." },
      ]),
    ).toBe("Note: [[heart rate 54|sp_hr]].");
  });

  it("leaves text that only looks like markup alone when the id is not valid", () => {
    expect(passageToTokens("See [[pain|not an id]] now")).toEqual([
      { kind: "text", value: "See [[pain|not an id]] now" },
    ]);
  });

  it("lists spans in reading order with their phrases", () => {
    expect(spansInText("[[a b|x]] and [[c|y]]")).toEqual([
      { id: "x", phrase: "a b" },
      { id: "y", phrase: "c" },
    ]);
  });

  it("names a new span after the ones already taken", () => {
    expect(nextSpanId(new Set(["span_1", "span_2"]))).toBe("span_3");
    expect(nextSpanId(new Set())).toBe("span_1");
  });

  it("marks the selected phrase, trimming surrounding spaces out of the span", () => {
    expect(markSpan("Pulse 120 today", 5, 10, new Set())).toEqual({
      text: "Pulse [[120|span_1]] today",
      spanId: "span_1",
    });
  });

  it("refuses to mark an empty selection or one that crosses existing markup", () => {
    expect(markSpan("Pulse", 2, 2, new Set())).toBeNull();
    expect(markSpan("a [[b|x]] c", 0, 5, new Set(["x"]))).toBeNull();
  });
});

describe("removing spans", () => {
  it("unwraps one span back to its phrase and leaves the others", () => {
    expect(unmarkSpan("[[fever|a]] and [[cough|b]]", "a")).toBe("fever and [[cough|b]]");
    expect(unmarkSpan("no spans here", "a")).toBe("no spans here");
  });

  it("drops correct marks and rationale for spans no longer present", () => {
    expect(
      pruneAnswers(
        { correctSpanIds: ["a", "b"], spanRationales: { a: "Why a.", b: "Why b." } },
        new Set(["b"]),
      ),
    ).toEqual({ correctSpanIds: ["b"], spanRationales: { b: "Why b." } });
  });
});

describe("highlight text form mapping", () => {
  it.each([
    ["canonical", FIXTURES.highlight_text.canonical],
    ["edge", FIXTURES.highlight_text.edge],
  ])("round-trips the %s fixture", (_name, input) => {
    const item = parseText(input);
    expect(parseText(fromHighlightTextForm(toHighlightTextForm(item)))).toEqual(item);
  });

  it("scores plus/minus with one point per correct span", () => {
    const form = toHighlightTextForm(parseText(FIXTURES.highlight_text.canonical));
    expect(fromHighlightTextForm(form).scoring).toEqual({ model: "plus_minus", maxPoints: 3 });
  });

  it("keeps per-span rationale keyed by span id, and drops blank ones", () => {
    const form = {
      ...emptyHighlightTextForm("ht_new"),
      passage: "[[a|x]] [[b|y]]",
      correctSpanIds: ["x"],
      spanRationales: { x: "Because.", y: "  " },
    };
    expect(fromHighlightTextForm(form).rationale).toEqual({
      perElement: { x: { kind: "markdown", value: "Because." } },
    });
  });

  it("ignores a correct mark for a span no longer in the passage", () => {
    const form = {
      ...emptyHighlightTextForm("ht_new"),
      passage: "[[a|x]] [[b|y]]",
      correctSpanIds: ["x", "gone"],
    };
    expect(fromHighlightTextForm(form).answerKey).toEqual({ correctSpanIds: ["x"] });
  });

  it("starts empty and invalid until spans are marked", () => {
    const form = emptyHighlightTextForm("ht_new");
    expect(form.passage).toBe("");
    expect(highlightTextItemSchema.safeParse(fromHighlightTextForm(form)).success).toBe(false);
  });
});

describe("highlight table form mapping", () => {
  it.each([
    ["canonical (scored per row)", FIXTURES.highlight_table.canonical],
    ["edge (scored whole)", FIXTURES.highlight_table.edge],
  ])("round-trips the %s fixture", (_name, input) => {
    const item = parseTable(input);
    expect(parseTable(fromHighlightTableForm(toHighlightTableForm(item)))).toEqual(item);
  });

  it("scores plus/minus with one point per correct span, per row or whole", () => {
    const perRow = toHighlightTableForm(parseTable(FIXTURES.highlight_table.canonical));
    const whole = toHighlightTableForm(parseTable(FIXTURES.highlight_table.edge));
    expect(fromHighlightTableForm(perRow).scoring).toEqual({ model: "plus_minus", maxPoints: 4 });
    expect(fromHighlightTableForm(whole).scoring).toEqual({ model: "plus_minus", maxPoints: 3 });
  });

  it("lists every span across the table's cells", () => {
    const form = toHighlightTableForm(parseTable(FIXTURES.highlight_table.edge));
    expect(spansInTable(form).map((span) => span.id)).toEqual(["a", "b", "e", "c", "d"]);
  });

  it("starts with two columns and two rows of empty cells, invalid until filled in", () => {
    const form = emptyHighlightTableForm("htb_new");
    expect(form.columns).toHaveLength(2);
    expect(form.rows).toHaveLength(2);
    expect(form.rows[0].cells).toHaveLength(2);
    expect(highlightTableItemSchema.safeParse(fromHighlightTableForm(form)).success).toBe(false);
  });
});

describe("highlightWarning", () => {
  it("warns when more than 60% of spans are correct", () => {
    expect(highlightWarning(5, 4)).toBe(
      "4 of 5 phrases are marked correct. Items work best when most phrases are not.",
    );
  });

  it("stays quiet at or below 60%, or with too few spans to judge", () => {
    expect(highlightWarning(5, 3)).toBeUndefined();
    expect(highlightWarning(1, 1)).toBeUndefined();
  });
});
