import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BankList } from "./BankList";

const banks = [
  { id: "b1", name: "Cardiac", itemCount: 12, updatedAt: "2026-09-12T15:00:00Z" },
  { id: "b2", name: "Respiratory", itemCount: 1, updatedAt: "2026-09-10T09:30:00Z" },
];

describe("BankList", () => {
  it("links each quiz by name, with its size and last edit", () => {
    render(<BankList banks={banks} />);
    const cardiac = screen.getByRole("link", { name: /Cardiac/ });
    expect(cardiac).toHaveAttribute("href", "/author/banks/b1");
    expect(within(cardiac).getByText("12 questions")).toBeInTheDocument();
    expect(within(cardiac).getByText("Edited Sep 12, 2026")).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /Respiratory/ })).getByText("1 question"),
    ).toBeInTheDocument();
  });

  it("lists quizzes in a named list", () => {
    render(<BankList banks={banks} />);
    expect(
      within(screen.getByRole("list", { name: "Quizzes" })).getAllByRole("listitem"),
    ).toHaveLength(2);
  });

  it("marks a quiz shared for practice with the classes' names (#240)", () => {
    render(<BankList banks={banks} sharedWith={new Map([["b1", ["NUR 310", "NUR 320"]]])} />);
    const cardiac = screen.getByRole("link", { name: /Cardiac/ });
    expect(
      within(cardiac).getByText("Shared for practice with NUR 310 and NUR 320"),
    ).toBeInTheDocument();
    const respiratory = screen.getByRole("link", { name: /Respiratory/ });
    expect(within(respiratory).queryByText(/Shared for practice/)).toBeNull();
  });

  it("says so in one line, with the way to a new quiz, when there are no quizzes", () => {
    const { container } = render(
      <BankList banks={[]} emptyAction={{ href: "#new-bank-heading", label: "New quiz" }} />,
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "No quizzes yet" })).toBeInTheDocument();
    // One line and one action (#412): no sentence under the heading.
    expect(container.querySelector("p")).toBeNull();
    expect(screen.getByRole("link", { name: "New quiz" })).toHaveAttribute(
      "href",
      "#new-bank-heading",
    );
  });
});
