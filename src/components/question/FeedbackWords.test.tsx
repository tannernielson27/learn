import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShowFeedbackWords } from "./FeedbackWords";
import { FeedbackIcon, OptionRow } from "./OptionRow";

function missedRow() {
  return (
    <OptionRow
      id="o1"
      name="q1"
      kind="checkbox"
      label="Elevate the head of the bed"
      checked={false}
      feedback="missed"
      mode="feedback"
      onToggle={() => {}}
    />
  );
}

describe("feedback words", () => {
  it("shows the word on screen by default, so colour is never the only signal", () => {
    render(missedRow());
    expect(screen.getByText("Missed")).not.toHaveClass("sr-only");
    expect(screen.getByRole("checkbox")).toHaveAccessibleName(/Missed/);
  });

  it("still shows it inside ShowFeedbackWords", () => {
    render(<ShowFeedbackWords>{missedRow()}</ShowFeedbackWords>);
    expect(screen.getByText("Missed")).not.toHaveClass("sr-only");
    expect(screen.getByRole("checkbox")).toHaveAccessibleName(/Missed/);
  });
});

describe("feedback icons", () => {
  it("gives a missed answer no check: a mark on an option the student did not pick reads as theirs", () => {
    render(missedRow());
    expect(document.querySelector("[data-feedback-mark]")).toBeNull();
    expect(document.body.textContent).not.toContain("✓");
  });

  it.each([
    ["correct", "✓"],
    ["incorrect", "✕"],
  ] as const)("marks a %s choice with %s", (state, icon) => {
    render(<FeedbackIcon state={state} />);
    expect(document.querySelector("[data-feedback-mark]")).toHaveTextContent(icon);
  });
});
