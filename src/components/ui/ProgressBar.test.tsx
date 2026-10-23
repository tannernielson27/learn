import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("reports its value and draws it with a transform", () => {
    render(<ProgressBar value={18} max={24} label="Answered" valueText="18 of 24 answered" />);
    const bar = screen.getByRole("progressbar", { name: "Answered" });
    expect(bar).toHaveAttribute("aria-valuenow", "18");
    expect(bar).toHaveAttribute("aria-valuemax", "24");
    expect(bar).toHaveAttribute("aria-valuetext", "18 of 24 answered");
    expect(screen.getByTestId("progress-fill").style.transform).toBe("scaleX(0.75)");
  });

  it("keeps the value inside the bar, and is empty out of nothing", () => {
    const { rerender } = render(<ProgressBar value={30} max={12} label="Questions" size="lg" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuetext", "12 of 12");
    expect(bar).toHaveClass("h-2");
    rerender(<ProgressBar value={3} max={0} label="Questions" />);
    expect(screen.getByTestId("progress-fill").style.transform).toBe("scaleX(0)");
  });
});
