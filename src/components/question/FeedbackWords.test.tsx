import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShowFeedbackWords } from "./FeedbackWords";
import { OptionRow } from "./OptionRow";

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
  it("keeps the word for assistive technology only by default, as live rooms show it", () => {
    render(missedRow());
    expect(screen.getByText("Missed")).toHaveClass("sr-only");
    expect(screen.getByRole("checkbox")).toHaveAccessibleName(/Missed/);
  });

  it("shows the word on screen inside ShowFeedbackWords, so colour is never the only signal", () => {
    render(<ShowFeedbackWords>{missedRow()}</ShowFeedbackWords>);
    expect(screen.getByText("Missed")).not.toHaveClass("sr-only");
    expect(screen.getByRole("checkbox")).toHaveAccessibleName(/Missed/);
  });
});
