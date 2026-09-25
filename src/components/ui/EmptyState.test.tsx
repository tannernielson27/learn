import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it.each([2, 3, 4] as const)("renders the heading as a real heading at level %i", (level) => {
    render(
      <EmptyState level={level} heading="No classes yet" body="Make one to invite students." />,
    );
    expect(screen.getByRole("heading", { level, name: "No classes yet" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("says the next step in one sentence under the heading", () => {
    render(<EmptyState level={2} heading="No classes yet" body="Make one to invite students." />);
    expect(screen.getByText("Make one to invite students.")).toBeInTheDocument();
  });

  it("renders the action as a link to where the next step is", () => {
    render(
      <EmptyState
        level={2}
        heading="No classes yet"
        body="Make one to invite students."
        action={{ href: "#new-class-heading", label: "Create a class" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Create a class" })).toHaveAttribute(
      "href",
      "#new-class-heading",
    );
  });

  it("has no link when there is no action", () => {
    render(<EmptyState level={3} heading="Nothing is open right now" body="Check back later." />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks its region so a test can tell it from a blank one", () => {
    const { container } = render(
      <EmptyState level={2} heading="No classes yet" body="Make one to invite students." />,
    );
    expect(container.querySelector("[data-empty-state]")).not.toBeNull();
  });
});
