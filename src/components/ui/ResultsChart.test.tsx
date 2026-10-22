import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultsChart, sharePercent, type ResultsChartRow } from "./ResultsChart";

const ROWS: ResultsChartRow[] = [
  { letter: "A", label: "Auscultate the lungs", count: 13, isKey: true },
  { letter: "B", label: "Encourage fluids", count: 1 },
  { letter: "C", label: "Reassess tomorrow", count: 3 },
];

describe("ResultsChart", () => {
  it("shows every option's letter, words, count and share", () => {
    render(<ResultsChart rows={ROWS} total={22} />);
    const list = screen.getByRole("list", { name: "How the class answered" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("B. Encourage fluids");
    expect(rows[1]).toHaveTextContent("1 · 5%");
  });

  it("marks the key three ways: fill, outline, and a check with the word", () => {
    render(<ResultsChart rows={ROWS} total={22} />);
    const [key, other] = screen.getAllByRole("listitem");
    expect(key).toHaveTextContent("Correct");
    expect(key.querySelector(".lucide-check")).not.toBeNull();
    const bars = screen.getAllByTestId("results-bar");
    expect(bars[0]).toHaveClass("bg-chart-key", "motion-grow");
    expect(bars[0].parentElement).toHaveClass("outline-chart-key");
    expect(bars[0].style.transform).toBe("scaleX(0.59)");
    expect(bars[1]).toHaveClass("bg-chart-bar");
    expect(other).not.toHaveTextContent("Correct");
  });

  it("has no red anywhere, so red and green never sit side by side", () => {
    const { container } = render(<ResultsChart rows={ROWS} total={22} size="stage" />);
    expect(container.innerHTML).not.toMatch(/incorrect/);
  });

  it("works out shares, and zero out of nothing", () => {
    expect(sharePercent(1, 3)).toBe(33);
    expect(sharePercent(4, 0)).toBe(0);
  });
});
