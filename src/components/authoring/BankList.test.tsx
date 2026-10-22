import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BankList } from "./BankList";
import { QuizSearch, QuizSearchField } from "./QuizSearch";

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

  it("starts a live session of each quiz, teacher-paced, from its row", () => {
    const start = vi.fn(() => async () => {});
    const { container } = render(<BankList banks={banks} start={start} />);
    expect(start).toHaveBeenCalledWith("b1");
    expect(start).toHaveBeenCalledWith("b2");
    const button = screen.getByRole("button", { name: "Start a live session of Cardiac" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveTextContent("Start");
    const pacing = container.querySelectorAll<HTMLInputElement>('input[name="pacing"]');
    expect([...pacing].map((input) => input.value)).toEqual([
      "instructor_paced",
      "instructor_paced",
    ]);
  });

  it("offers no Start without a way to start", () => {
    render(<BankList banks={banks} />);
    expect(screen.queryByRole("button", { name: /^Start/ })).toBeNull();
  });

  it("names the folder each quiz is in, for All quizzes", () => {
    render(<BankList banks={banks} folderNames={new Map([["b1", "Med-Surg/Week 1"]])} />);
    expect(
      within(screen.getByRole("link", { name: /Cardiac/ })).getByText("Med-Surg/Week 1"),
    ).toBeInTheDocument();
  });

  it("narrows to the quizzes whose names match the search, and says how many", () => {
    render(
      <QuizSearch names={banks.map((bank) => bank.name)}>
        <QuizSearchField />
        <BankList banks={banks} searchable />
      </QuizSearch>,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search quizzes" }), {
      target: { value: "resp" },
    });
    expect(screen.queryByRole("link", { name: /Cardiac/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Respiratory/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 quizzes match “resp”.");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search quizzes" }), {
      target: { value: "" },
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
