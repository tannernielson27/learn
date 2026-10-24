import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageReveal } from "./StageReveal";

/**
 * The answer on a short projector: the rationale is clamped and gives way, and the chart keeps a
 * floor of its own, so a long rationale can never squeeze the bars off the wall. jsdom cannot lay
 * it out; these pin the rules the layout rests on.
 */

const RATIONALE =
  "Sudden dyspnea, pleuritic pain and hypoxemia after hip surgery suggest a pulmonary embolism. " +
  "Raise the head of the bed, give oxygen and call the provider at once. ".repeat(6);

function draw() {
  render(
    <StageReveal
      place={{ position: 3, itemCount: 20, label: "Question 3 of 20", caseStep: null }}
      answers={{ responded: 60, present: 70 }}
      question={null}
      rows={[
        { letter: "A", label: "Raise the head of the bed", count: 40, isKey: true },
        { letter: "B", label: "Encourage fluids", count: 20 },
      ]}
      total={60}
      rationale={{ kind: "markdown", value: RATIONALE }}
    />,
  );
}

describe("StageReveal: a long rationale on a short projector", () => {
  it("clamps the rationale to about four lines and lets it give way", () => {
    draw();
    const rationale = screen.getByTestId("stage-rationale");
    expect(rationale).toHaveClass("line-clamp-4", "min-h-0");
    expect(rationale).not.toHaveClass("shrink-0");
  });

  it("gives the chart a floor, so every bar shows whatever the rationale holds", () => {
    draw();
    const chart = screen.getByRole("list", { name: "How the class answered" }).parentElement;
    expect(chart).toHaveClass("flex-1", "min-h-[45cqb]");
    expect(screen.getAllByTestId("results-bar")).toHaveLength(2);
  });
});
