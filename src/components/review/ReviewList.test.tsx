import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewList } from "./ReviewList";

const entries = [
  { id: "s1", label: "Step 1: Recognize Cues", answered: true, flagged: false },
  { id: "s2", label: "Step 2: Analyze Cues", answered: true, flagged: true },
  { id: "s3", label: "Step 3: Prioritize Hypotheses", answered: false, flagged: false },
];

const list = () => screen.getByRole("region", { name: "Review this case study" });

describe("ReviewList", () => {
  it("says each item's state in words, not by colour", () => {
    render(<ReviewList label="Review this case study" entries={entries} onJump={() => {}} />);
    const rows = within(list()).getAllByRole("button");
    expect(rows[0]).toHaveTextContent("Step 1: Recognize CuesAnswered");
    expect(rows[1]).toHaveTextContent("Answered, flagged for review");
    expect(rows[2]).toHaveTextContent("Not answered");
  });

  it("marks the one being shown as current rather than as somewhere to go", () => {
    render(
      <ReviewList
        label="Review this case study"
        entries={entries}
        currentId="s2"
        onJump={() => {}}
      />,
    );
    const rows = within(list()).getAllByRole("button");
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(rows[0]).not.toHaveAttribute("aria-current");
  });

  it("takes the student to the one they choose", async () => {
    const onJump = vi.fn();
    render(<ReviewList label="Review this case study" entries={entries} onJump={onJump} />);
    await userEvent.click(screen.getByRole("button", { name: /Step 3/ }));
    expect(onJump).toHaveBeenCalledWith("s3");
  });
});
