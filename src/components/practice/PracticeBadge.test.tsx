import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PracticeBadge } from "./PracticeBadge";

describe("PracticeBadge", () => {
  it("names the classes a bank is shared with", () => {
    render(<PracticeBadge classNames={["NUR 310", "NUR 320"]} />);
    expect(screen.getByText("Shared for practice with NUR 310 and NUR 320")).toBeInTheDocument();
  });

  it("renders nothing for a bank shared with nobody", () => {
    const { container } = render(<PracticeBadge classNames={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
