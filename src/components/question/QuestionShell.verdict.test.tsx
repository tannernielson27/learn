import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScoreResult } from "@/lib/ngn/types";
import { QuestionShell } from "./QuestionShell";
import { scoreVerdict } from "./verdict";

const score = (points: number, maxPoints: number): ScoreResult => ({
  points,
  maxPoints,
  model: "plus_minus",
  breakdown: [],
});

function renderScored(result: ScoreResult) {
  render(
    <QuestionShell
      stem={{ kind: "markdown", value: "Which findings need follow-up?" }}
      mode="feedback"
      canSubmit={false}
      score={result}
    >
      <p>The item</p>
    </QuestionShell>,
  );
  return screen.getByRole("complementary", { name: "Score" });
}

describe("scoreVerdict", () => {
  it("names full, part and no marks, and never counts an item worth nothing as full", () => {
    expect(scoreVerdict(score(1, 1)).kind).toBe("full");
    expect(scoreVerdict(score(4, 4)).kind).toBe("full");
    expect(scoreVerdict(score(3, 4)).kind).toBe("partial");
    expect(scoreVerdict(score(0, 4)).kind).toBe("none");
    expect(scoreVerdict(score(0, 0)).kind).toBe("none");
  });

  it("says the points in words, singular and plural", () => {
    expect(scoreVerdict(score(1, 1)).detail).toBe("1 of 1 point");
    expect(scoreVerdict(score(3, 4)).detail).toBe("3 of 4 points");
    expect(scoreVerdict(score(0, 2)).detail).toBe("0 of 2 points");
  });
});

describe("QuestionShell score verdict", () => {
  it("leads a full-marks answer with All correct and a check", () => {
    const panel = renderScored(score(2, 2));
    expect(within(panel).getByText("All correct")).toBeInTheDocument();
    expect(panel).toHaveAttribute("data-verdict", "full");
    expect(panel).toHaveAccessibleDescription(/All correct.*2 of 2 points/);
  });

  it("says Partially correct when some points were earned", () => {
    const panel = renderScored(score(3, 4));
    expect(within(panel).getByText("Partially correct")).toBeInTheDocument();
    expect(panel).toHaveAttribute("data-verdict", "partial");
    expect(panel).toHaveAccessibleDescription(/Partially correct.*3 of 4 points/);
  });

  it("says Not correct when no points were earned", () => {
    const panel = renderScored(score(0, 3));
    expect(within(panel).getByText("Not correct")).toBeInTheDocument();
    expect(panel).toHaveAttribute("data-verdict", "none");
  });

  it("never reuses the element words, so an option and the item are never both 'Correct'", () => {
    const panel = renderScored(score(1, 1));
    expect(within(panel).queryByText("Correct")).toBeNull();
    expect(within(panel).queryByText("Incorrect")).toBeNull();
  });
});
