import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteFolderForm, type DeleteFolderFormProps } from "./DeleteFolderForm";
import type { FolderFormState } from "./FolderNameForm";

function setup(result: FolderFormState) {
  const action = vi.fn<DeleteFolderFormProps["action"]>(async () => result);
  render(<DeleteFolderForm action={action} />);
  return { action, user: userEvent.setup() };
}

describe("DeleteFolderForm", () => {
  it("deletes the folder with one button", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.click(screen.getByRole("button", { name: "Delete folder" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("says what is inside a folder it could not delete, and focuses the message", async () => {
    const message = '"Cardiac" holds 5 items. Move or delete them first.';
    const { user } = setup({ status: "error", error: message });
    await user.click(screen.getByRole("button", { name: "Delete folder" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
  });
});
