import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnswerSentLine } from "./AnswerSentLine";

describe("AnswerSentLine", () => {
  it("draws a check beside the words, hidden from a screen reader", () => {
    render(<AnswerSentLine text="Answer sent." />);

    const line = screen.getByTestId("answer-sent");
    expect(line).toHaveTextContent(/^Answer sent\.$/);
    expect(line).toHaveClass("text-accent-ink");
    const icon = line.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    // A fixed size from the first frame, so the line never grows as the icon arrives.
    expect(icon).toHaveClass("size-5", "shrink-0");
  });

  it("settles in with motion-arrive, and reduced motion turns the animation off", () => {
    render(<AnswerSentLine text="Answer sent." />);

    const settling = screen.getByTestId("answer-sent").querySelector('[data-motion="answer-sent"]');
    expect(settling).toHaveClass("motion-arrive", "motion-reduce:animate-none");
  });

  it("is a status only when the room asks for one", () => {
    const { rerender } = render(<AnswerSentLine text="Answer sent." />);
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<AnswerSentLine text="Answer sent." announce />);
    expect(screen.getByRole("status")).toHaveTextContent("Answer sent.");
  });
});
