import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QuizEntry } from "@/lib/authoring/quizOrder";
import { QuizOrderEditor, type QuizOrderEditorProps, type QuizOrderState } from "./QuizOrderEditor";

const ENTRIES: QuizEntry[] = [
  {
    kind: "item",
    id: "i1",
    label: "Chest pain first",
    format: "Multiple Choice",
    status: "Published",
  },
  { kind: "case_study", id: "c1", label: "Sepsis", format: "Case study", status: "Draft" },
  { kind: "item", id: "i2", label: "Fluids last", format: "Bowtie", status: "Published" },
];

function setup(result: QuizOrderState = { status: "done", message: "Order saved." }) {
  const action = vi.fn<QuizOrderEditorProps["action"]>(async () => result);
  const { container } = render(<QuizOrderEditor entries={ENTRIES} action={action} />);
  const sent = () =>
    [...container.querySelectorAll<HTMLInputElement>('input[name="entry"]')].map((i) => i.value);
  return { action, sent, user: userEvent.setup() };
}

function rows(): string[] {
  const list = screen.getByRole("list", { name: "Questions and case studies in order" });
  return within(list)
    .getAllByRole("listitem")
    .map((row) => row.textContent ?? "");
}

describe("QuizOrderEditor", () => {
  it("lists every entry in the saved order, with its number, format and status", () => {
    setup();
    expect(rows()).toEqual([
      "1Chest pain firstMultiple ChoicePublished",
      "2SepsisCase studyDraft",
      "3Fluids lastBowtiePublished",
    ]);
  });

  it("offers no move past either end, and nothing to save until the order changes", () => {
    setup();
    expect(screen.getByRole("button", { name: 'Move "Chest pain first" up' })).toBeDisabled();
    expect(screen.getByRole("button", { name: 'Move "Fluids last" down' })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save order" })).toBeDisabled();
  });

  it("moves an entry with its buttons, says where it went and keeps focus on it", async () => {
    const { sent, user } = setup();
    await user.click(screen.getByRole("button", { name: 'Move "Fluids last" up' }));
    expect(sent()).toEqual(["i1", "i2", "c1"]);
    expect(screen.getByRole("status", { name: "Order changes" })).toHaveTextContent(
      "Fluids last, position 2 of 3.",
    );
    expect(screen.getByRole("button", { name: 'Move "Fluids last" up' })).toHaveFocus();
    expect(screen.getByText("Not saved yet.")).toBeInTheDocument();

    // At the top the same button is spent, so focus moves to the one still enabled.
    await user.click(screen.getByRole("button", { name: 'Move "Fluids last" up' }));
    expect(sent()).toEqual(["i2", "i1", "c1"]);
    expect(screen.getByRole("button", { name: 'Move "Fluids last" down' })).toHaveFocus();
  });

  it("is reachable from the keyboard alone", async () => {
    const { sent, user } = setup();
    screen.getByRole("button", { name: 'Move "Chest pain first" down' }).focus();
    await user.keyboard("{Enter}");
    expect(sent()).toEqual(["c1", "i1", "i2"]);
  });

  it("saves the whole order at once and starts again from it", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: 'Move "Sepsis" up' }));
    await user.click(screen.getByRole("button", { name: "Save order" }));
    expect(action.mock.calls[0][1].getAll("entry")).toEqual(["c1", "i1", "i2"]);
    expect(await screen.findByText("Order saved.")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Save order" })).toBeDisabled();
    expect(screen.queryByText("Not saved yet.")).not.toBeInTheDocument();
  });

  it("announces a refusal and keeps the order the teacher made", async () => {
    const error = "This quiz has changed since the page loaded. Reload the page and try again.";
    const { sent, user } = setup({ status: "error", error });
    await user.click(screen.getByRole("button", { name: 'Move "Sepsis" down' }));
    await user.click(screen.getByRole("button", { name: "Save order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(error);
    expect(sent()).toEqual(["i1", "i2", "c1"]);
    expect(screen.getByRole("button", { name: "Save order" })).toBeEnabled();

    // Once the list no longer shows the order that was refused, neither does the refusal.
    await user.click(screen.getByRole("button", { name: 'Move "Sepsis" up' }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
