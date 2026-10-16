import { cleanup, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { allFixtures } from "@/lib/ngn/fixtures";
import { itemSchema, type AnyResponse } from "@/lib/ngn/schemas";
import { scoreSubmission } from "@/lib/ngn/submit";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { feedbackMarkClasses } from "./feedbackMarks";
import { ItemPlayer } from "./ItemPlayer";

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean);

describe("feedbackMarkClasses (docs/04 §4)", () => {
  it("gives correct and incorrect a 4px left rule in their colour, over the soft fill", () => {
    expect(tokens(feedbackMarkClasses("correct"))).toEqual(
      expect.arrayContaining(["border-l-4", "border-l-correct", "bg-correct-soft"]),
    );
    expect(tokens(feedbackMarkClasses("incorrect"))).toEqual(
      expect.arrayContaining(["border-l-4", "border-l-incorrect", "bg-incorrect-soft"]),
    );
  });

  it("keeps the element's own edge colour on the other three sides", () => {
    expect(tokens(feedbackMarkClasses("correct", "border-line-strong"))).toContain(
      "border-line-strong",
    );
    expect(tokens(feedbackMarkClasses("incorrect", "border-transparent"))).toContain(
      "border-transparent",
    );
    expect(feedbackMarkClasses("neutral", "border-line-strong")).toBe("border-line-strong");
  });

  it("never colours the whole border correct or incorrect for a chosen answer", () => {
    for (const state of ["correct", "incorrect"] as const) {
      const list = tokens(feedbackMarkClasses(state));
      expect(list).not.toContain("border-correct");
      expect(list).not.toContain("border-incorrect");
    }
  });

  it("keeps the element's own fill only where there is no soft fill to override", () => {
    const fill = "bg-surface-1";
    expect(tokens(feedbackMarkClasses("correct", "border-line", fill))).not.toContain(fill);
    expect(tokens(feedbackMarkClasses("incorrect", "border-line", fill))).not.toContain(fill);
    expect(tokens(feedbackMarkClasses("missed", "border-line", fill))).toContain(fill);
    expect(feedbackMarkClasses("neutral", "border-line", fill)).toBe("border-line bg-surface-1");
  });

  it("draws missed as a dashed --correct border with no edge colour to override it", () => {
    // border-line and border-line-strong are emitted after border-correct, so either would win.
    expect(tokens(feedbackMarkClasses("missed", "border-line-strong"))).toEqual([
      "border-dashed",
      "border-correct",
    ]);
  });
});

const refuse = vi.fn(async () => {
  throw new Error("Already answered.");
});

/** Highlight marks words in running text with backgrounds instead (docs/04 §4, "Highlight items"). */
const BACKGROUND_MARKS = new Set(["highlight_text", "highlight_table"]);

const MARKED_FIXTURES = allFixtures.filter((f) => !BACKGROUND_MARKS.has(f.type));

describe("one feedback-mark treatment across item types (#325)", () => {
  // One test per type, so a slow machine spends its timeout on one renderer's cases, not all.
  it.each(MARKED_FIXTURES.map((f) => [f.type, f] as const))(
    "%s: a left rule for every chosen element and a dashed border for every missed one",
    async (_type, fixture) => {
      const item = itemSchema.parse(fixture.canonical);
      let checked = 0;
      for (const scoreCase of fixture.cases) {
        const response = scoreCase.response as AnyResponse;
        const { container } = render(
          <ItemPlayer
            item={item}
            initialResponse={response}
            initialReveal={scoreSubmission(item, response)}
            submit={refuse}
          />,
        );
        await renderersLoaded();
        const where = `${item.type} / ${scoreCase.name}`;

        for (const tone of ["correct", "incorrect"]) {
          for (const el of container.querySelectorAll(`.bg-${tone}-soft`)) {
            expect(el.classList.contains(`border-l-${tone}`), `${where}: ${tone} rule`).toBe(true);
            expect(el.classList.contains("border-l-4"), `${where}: ${tone} rule width`).toBe(true);
            expect(el.classList.contains(`border-${tone}`), `${where}: full border`).toBe(false);
            // bg-surface-1 is emitted after the soft fills and would hide them (a native select).
            expect(el.classList.contains("bg-surface-1"), `${where}: competing fill`).toBe(false);
            checked += 1;
          }
        }
        for (const el of container.querySelectorAll(".border-dashed.border-correct")) {
          // Any other border colour is emitted after border-correct and would hide the dashes.
          const edge = [...el.classList].filter((c) => /^border-(line|transparent)/.test(c));
          expect(edge, `${where}: missed edge colour`).toEqual([]);
          checked += 1;
        }
        cleanup();
      }
      expect(checked, `${item.type} drew no marks`).toBeGreaterThan(0);
    },
  );
});
