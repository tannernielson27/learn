import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RowScoreMark } from "./Matrix";

describe("RowScoreMark", () => {
  it.each([
    [2, 2, "text-correct"],
    [1, 2, "text-ink-1"],
    [0, 2, "text-incorrect"],
  ])("colours %i/%i as %s, with the numbers still said", (points, maxPoints, tone) => {
    render(<RowScoreMark score={{ points, maxPoints }} />);
    const mark = screen.getByText(`${points}/${maxPoints}`, { exact: false });
    expect(mark).toHaveClass(tone);
    expect(mark).toHaveTextContent(`Row score ${points}/${maxPoints}`);
  });
});
