import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("ConfirmDialog", () => {
  it("asks, with the move in words as the primary button", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="End this live session?"
        description="Phones stop taking answers."
        confirmLabel="End live session"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole("dialog", { name: "End this live session?" })).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "End live session" });
    expect(confirm).toHaveClass("bg-accent");
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("holds both buttons still while the move is in flight", () => {
    render(
      <ConfirmDialog
        open
        title="Delete this folder?"
        confirmLabel="Delete folder"
        cancelLabel="Keep it"
        onConfirm={() => {}}
        onCancel={() => {}}
        busy
      >
        <p>Its quizzes stay in the library.</p>
      </ConfirmDialog>,
    );
    expect(screen.getByRole("button", { name: "Delete folder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete folder" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("button", { name: "Keep it" })).toBeDisabled();
    expect(screen.getByText("Its quizzes stay in the library.")).toBeInTheDocument();
  });
});
