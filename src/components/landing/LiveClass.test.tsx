import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { multipleChoiceFixture } from "@/lib/ngn/fixtures/selection";
import { LiveClass } from "./LiveClass";
import { LIVE_CLASS_DEMO } from "./liveClassDemo";

const fixture = multipleChoiceFixture.canonical;

// #563: the landing page shows a live session as the class sees it, drawn, not a screenshot.
describe("LiveClass", () => {
  it("is one captioned figure: the projector's question, its choices and the count", () => {
    render(<LiveClass />);
    const figure = screen.getByRole("figure", { name: /a live session as the class sees it/i });
    const projector = within(figure).getByTestId("live-class-projector");
    expect(projector).toHaveTextContent(fixture.stem.value);
    const choices = within(projector).getByRole("list", { name: "Choices" });
    expect(
      within(choices)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(
      fixture.content.options.map((option, index) => {
        const letter = String.fromCharCode(65 + index);
        return `${letter}${letter}. ${option.label}`;
      }),
    );
    expect(projector).toHaveTextContent("Question 3 of 10");
    expect(projector).toHaveTextContent("Join at learnursing.app/join · V96 RN8");
    // A count, never who (owner decision 4), and a screen reader hears only where it settles.
    const count = within(projector).getByTestId("live-class-count");
    expect(count.textContent).toContain("of 24 answered");
    expect(count).toHaveTextContent(/^1518 of 24 answered$/);
    expect(within(count).getByText("15")).toHaveAttribute("aria-hidden", "true");
    expect(within(count).getByText("18")).not.toHaveAttribute("aria-hidden");
  });

  it("keeps the projector light in both themes, as the real one is", () => {
    render(<LiveClass />);
    expect(screen.getByTestId("live-class-projector")).toHaveAttribute("data-theme", "light");
  });

  it("hides the phones, which repeat the projector, and says in the caption what they show", () => {
    const { container } = render(<LiveClass />);
    const hidden = container.querySelector('[aria-hidden="true"].relative');
    expect(hidden).not.toBeNull();
    expect(hidden).toHaveTextContent("Answer sent");
    expect(hidden).toHaveTextContent("Submit");
    expect(screen.getByRole("figure")).toHaveAccessibleName(
      expect.stringContaining(
        `one student has chosen ${LIVE_CLASS_DEMO.chosen}, one has sent ${LIVE_CLASS_DEMO.sent}`,
      ),
    );
  });

  it("has no heading of its own, so the page keeps its one h1", () => {
    render(<LiveClass />);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("marks a student's own pick with the selected look, never a mark of right or wrong", () => {
    const { container } = render(<LiveClass />);
    const html = container.innerHTML;
    expect(html).toContain("border-accent");
    expect(html).not.toMatch(/\b(?:bg|border|text)-(?:correct|incorrect)/);
    expect(container.textContent).not.toMatch(/\b(?:Correct|Incorrect|Missed)\b/);
  });

  it("plays three steps, a pick, a sent answer and the count, from its last frame", () => {
    const { container } = render(<LiveClass />);
    const steps = [...container.querySelectorAll<HTMLElement>("[data-demo-step]")].map((step) =>
      step.style.getPropertyValue("--step"),
    );
    expect(steps.sort()).toEqual(["0", "1", "2"]);
    expect(container.querySelectorAll("[data-demo-before]")).toHaveLength(1);
    // The HTML is the finished drawing: nothing holds it at its start.
    expect(container.querySelector("[data-demo]")).toBeNull();
  });
});

// docs/04 §5: transform and opacity only, nothing loops, and reduced motion moves nothing.
describe("the live session's motion (globals.css)", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const block = css.slice(css.indexOf("[data-demo=") - 200, css.indexOf("@keyframes fade-out"));
  const rules = [...block.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1] ?? "");

  it("moves only transform and opacity, through animations that run once", () => {
    const properties = rules
      .flatMap((body) => body.split(";"))
      .map((line) => line.split(":")[0]?.trim())
      .filter((name): name is string => Boolean(name));
    expect(new Set(properties)).toEqual(
      new Set(["opacity", "transform", "animation", "animation-delay"]),
    );
    expect(block).not.toMatch(/infinite|alternate/);
  });

  it("is the last frame under reduced motion, whatever the attribute says", () => {
    const reduced = block.slice(block.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(
      /\[data-demo\] \[data-demo-step\] \{\s*opacity: 1;\s*transform: none;\s*animation: none;/,
    );
    expect(reduced).toMatch(
      /\[data-demo\] \[data-demo-before\] \{\s*opacity: 0;\s*animation: none;/,
    );
  });
});
