import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FolderRow } from "@/lib/authoring/folders";
import type { FolderFormState } from "./FolderNameForm";
import { MoveToFolderForm, type MoveToFolderFormProps } from "./MoveToFolderForm";

const folders: FolderRow[] = [
  { id: "f2", parentId: null, name: "Respiratory" },
  { id: "f1", parentId: null, name: "Cardiac" },
  { id: "f3", parentId: "f1", name: "Heart failure" },
];

function setup(result: FolderFormState) {
  const action = vi.fn<MoveToFolderFormProps["action"]>(async () => result);
  render(
    <>
      {/* The lists' checkboxes sit outside the form and join it by its id. */}
      <input type="checkbox" form="move-form" name="item" value="i1" aria-label="Select item 1" />
      <input type="checkbox" form="move-form" name="item" value="i2" aria-label="Select item 2" />
      <MoveToFolderForm id="move-form" folders={folders} action={action} />
    </>,
  );
  return { action, user: userEvent.setup() };
}

describe("MoveToFolderForm", () => {
  it("offers Unfiled and every folder by path, in tree order", () => {
    setup({ status: "idle" });
    const select = screen.getByRole("combobox", { name: "Move selected to" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Choose a folder", "Unfiled", "Cardiac", "Cardiac/Heart failure", "Respiratory"]);
    expect(screen.getByRole("button", { name: "Move selected" })).toBeEnabled();
  });

  it("sends the chosen folder and the checked content that joined the form", async () => {
    const { action, user } = setup({ status: "idle" });
    await user.click(screen.getByRole("checkbox", { name: "Select item 2" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Move selected to" }),
      "Cardiac/Heart failure",
    );
    await user.click(screen.getByRole("button", { name: "Move selected" }));
    const sent = action.mock.calls[0][1];
    expect(sent.get("folder")).toBe("f3");
    expect(sent.getAll("item")).toEqual(["i2"]);
  });

  it("keeps the selection and the folder choice when a move is refused", async () => {
    const { user } = setup({ status: "error", error: "That folder no longer exists." });
    const box = screen.getByRole("checkbox", { name: "Select item 1" });
    const select = screen.getByRole("combobox", { name: "Move selected to" });
    await user.click(box);
    await user.selectOptions(select, "Cardiac");
    await user.click(screen.getByRole("button", { name: "Move selected" }));
    await screen.findByRole("alert");
    expect(box).toBeChecked();
    expect(select).toHaveValue("f1");
  });

  it("clears the selection once a move is done", async () => {
    const { user } = setup({ status: "done", message: "Moved 1 item to Cardiac." });
    const box = screen.getByRole("checkbox", { name: "Select item 1" });
    await user.click(box);
    await user.selectOptions(screen.getByRole("combobox", { name: "Move selected to" }), "Cardiac");
    await user.click(screen.getByRole("button", { name: "Move selected" }));
    await screen.findByRole("status");
    expect(box).not.toBeChecked();
  });

  it("announces a finished move", async () => {
    const { user } = setup({ status: "done", message: "Moved 2 items to Cardiac." });
    await user.click(screen.getByRole("button", { name: "Move selected" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Moved 2 items to Cardiac.");
  });

  it("ties a refused move's reason to the folder choice", async () => {
    const message = "Select at least one item or case study to move.";
    const { user } = setup({ status: "error", error: message });
    await user.click(screen.getByRole("button", { name: "Move selected" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("combobox", { name: "Move selected to" })).toHaveAccessibleDescription(
      message,
    );
  });
});
