import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnswerCount } from "./AnswerCount";

describe("AnswerCount", () => {
  it("reads as one sentence: 18 of 24 answered", () => {
    render(<AnswerCount answered={18} total={24} />);
    expect(screen.getByTestId("answer-count")).toHaveTextContent("18 of 24 answered");
  });

  it("sizes the number for the stage, and never shows below zero", () => {
    render(<AnswerCount answered={-2} total={5} size="stage" />);
    const count = screen.getByTestId("answer-count");
    expect(count).toHaveTextContent("0 of 5 answered");
    expect(count.firstElementChild).toHaveClass("text-stage-number");
  });
});
