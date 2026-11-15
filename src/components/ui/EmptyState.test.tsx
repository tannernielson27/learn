import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("is the first-use state unless told otherwise, the next step drawn as a button", () => {
    const { container } = render(
      <EmptyState
        level={2}
        heading="No quizzes yet"
        action={{ href: "/author/new", label: "Create a quiz" }}
      />,
    );
    expect(container.querySelector("[data-empty-state='first-use']")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveClass("font-read");
    expect(screen.getByRole("link", { name: "Create a quiz" })).toHaveClass("tap-target");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers the other ways to start beside the next step, quieter than it", () => {
    render(
      <EmptyState
        level={3}
        heading="No questions yet"
        action={{ href: "/new", label: "Write the first question" }}
        more={[{ href: "/ai", label: "Import questions with AI" }]}
      />,
    );
    const first = screen.getByRole("link", { name: "Write the first question" });
    const other = screen.getByRole("link", { name: "Import questions with AI" });
    expect(other).toHaveAttribute("href", "/ai");
    expect(first).toHaveClass("border-field-border");
    expect(other).toHaveClass("bg-transparent");
  });
});

describe("EmptyState no results (#563)", () => {
  it("says in one status line that nothing matched, with no heading of its own", () => {
    const { container } = render(
      <EmptyState
        variant="no-results"
        heading="No quizzes match “cardiac”."
        action={{ href: "/author", label: "Clear search" }}
      />,
    );
    expect(container.querySelector("[data-empty-state='no-results']")).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("No quizzes match “cardiac”.");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/author");
  });

  it("clears a filter the page holds with a button", async () => {
    const onClear = vi.fn();
    render(<EmptyState variant="no-results" heading="Nothing matches." onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("takes the page's own words for the button", () => {
    render(
      <EmptyState
        variant="no-results"
        heading="Nothing matches."
        onClear={() => {}}
        clearLabel="Show every student"
      />,
    );
    expect(screen.getByRole("button", { name: "Show every student" })).toBeInTheDocument();
  });
});
