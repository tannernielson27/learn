import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FolderFormState } from "./FolderNameForm";
import { QuizMoveForm } from "./QuizMoveForm";

const FORM = "move-form";
const RENAL = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f02";
const ITEM = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a01";
const CASE = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a02";
const KEPT = [
  "Its assignment keeps the questions it was given.",
  "Practice with NUR 310 stays with this quiz.",
];

type Move = (state: FolderFormState, formData: FormData) => Promise<FolderFormState>;

function draw(moveToQuiz: Move, folders = [] as { id: string; parentId: null; name: string }[]) {
  return render(
    <>
      <QuizMoveForm
        id={FORM}
        folders={folders}
        moveToFolder={vi.fn<Move>(async () => ({ status: "idle" }))}
        quizzes={[{ id: RENAL, name: "Renal week" }]}
        moveToQuiz={moveToQuiz}
        staysBehind={KEPT}
      />
      {/* The lists' checkboxes sit outside the form and join it by id, as on the quiz page. */}
      <input type="checkbox" form={FORM} name="item" value={ITEM} aria-label="Select question" />
      <input type="checkbox" form={FORM} name="caseStudy" value={CASE} aria-label="Select case" />
    </>,
  );
}

describe("QuizMoveForm", () => {
  it("draws nothing when there is neither a folder nor another quiz to move to", () => {
    const { container } = render(
      <QuizMoveForm id={FORM} folders={[]} quizzes={[]} staysBehind={KEPT} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers only the move to another quiz on a quiz with no folders inside it", () => {
    draw(vi.fn<Move>());
    expect(screen.getByRole("combobox", { name: "Move to another quiz" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Move selected to" })).toBeNull();
  });

  it("asks first, saying what stays with this quiz, and moves only once confirmed", async () => {
    const move = vi.fn<Move>(async () => ({ status: "done", message: "Moved." }));
    draw(move);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select question" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select case" }));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Move to another quiz" }),
      "Renal week",
    );
    await userEvent.click(screen.getByRole("button", { name: "Move to quiz" }));

    const dialog = screen.getByRole("dialog", {
      name: "Move 1 question and 1 case study to Renal week?",
    });
    const kept = within(dialog).getByRole("list", { name: "What stays with this quiz" });
    expect(
      within(kept)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(KEPT);
    expect(move).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    const sent = move.mock.calls[0]![1];
    expect(sent.get("quiz")).toBe(RENAL);
    expect(sent.getAll("item")).toEqual([ITEM]);
    expect(sent.getAll("caseStudy")).toEqual([CASE]);
    expect(await screen.findByRole("status")).toHaveTextContent("Moved.");
    // Done: the selection is cleared.
    expect(screen.getByRole("checkbox", { name: "Select question" })).not.toBeChecked();
  });

  it("moves nothing when the teacher cancels", async () => {
    const move = vi.fn<Move>();
    draw(move);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select question" }));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Move to another quiz" }),
      "Renal week",
    );
    await userEvent.click(screen.getByRole("button", { name: "Move to quiz" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(move).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Select question" })).toBeChecked();
  });

  it("asks for a quiz, then a selection, before asking to confirm", async () => {
    draw(vi.fn<Move>());
    await userEvent.click(screen.getByRole("button", { name: "Move to quiz" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a quiz to move to.");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Move to another quiz" }),
      "Renal week",
    );
    await userEvent.click(screen.getByRole("button", { name: "Move to quiz" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Select at least one question or case study to move.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the selection and says why when the move is refused", async () => {
    draw(
      vi.fn<Move>(async () => ({
        status: "error",
        error: "Moving to another quiz is not ready yet. Try again later.",
      })),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Select question" }));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Move to another quiz" }),
      "Renal week",
    );
    await userEvent.click(screen.getByRole("button", { name: "Move to quiz" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Move" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not ready yet");
    expect(screen.getByRole("checkbox", { name: "Select question" })).toBeChecked();
  });

  it("keeps the move between this quiz's folders where it has some", () => {
    draw(vi.fn<Move>(), [
      { id: "5d3c3f7e-1a2b-4c3d-8e4f-0a1b2c3d4e01", parentId: null, name: "Cardiac" },
    ]);
    expect(screen.getByRole("combobox", { name: "Move selected to" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move" })).toHaveAttribute("type", "submit");
  });
});
