import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FolderNameForm, type FolderFormState, type FolderNameFormProps } from "./FolderNameForm";

function setup(result: FolderFormState, props: Partial<FolderNameFormProps> = {}) {
  const action = vi.fn<FolderNameFormProps["action"]>(async () => result);
  render(
    <FolderNameForm action={action} label="Folder name" submitLabel="Create folder" {...props} />,
  );
  return { action, user: userEvent.setup() };
}

describe("FolderNameForm", () => {
  it("asks for a name with a labelled, bounded field", () => {
    setup({ status: "idle" });
    const field = screen.getByRole("textbox", { name: "Folder name" });
    expect(field).toBeRequired();
    expect(field).toHaveAttribute("maxlength", "80");
    expect(screen.getByRole("button", { name: "Create folder" })).toBeEnabled();
  });

  it("says where the folder will go, tied to the field", () => {
    setup({ status: "idle" }, { hint: "Creates it inside Cardiac." });
    expect(screen.getByRole("textbox", { name: "Folder name" })).toHaveAccessibleDescription(
      "Creates it inside Cardiac.",
    );
  });

  it("sends the name, then clears the field and announces a created folder", async () => {
    const { action, user } = setup({ status: "done", message: 'Created "Cardiac".' });
    const field = screen.getByRole("textbox", { name: "Folder name" });
    await user.type(field, "Cardiac");
    await user.click(screen.getByRole("button", { name: "Create folder" }));
    expect(action.mock.calls[0][1].get("name")).toBe("Cardiac");
    expect(await screen.findByRole("status")).toHaveTextContent('Created "Cardiac".');
    expect(field).toHaveValue("");
  });

  it("keeps a renamed folder's new name in the field", async () => {
    const { user } = setup(
      { status: "done", message: "Renamed." },
      { label: "New name", submitLabel: "Rename folder", initialName: "Cardiac" },
    );
    const field = screen.getByRole("textbox", { name: "New name" });
    await user.clear(field);
    await user.type(field, "Cardiology");
    await user.click(screen.getByRole("button", { name: "Rename folder" }));
    await screen.findByRole("status");
    expect(field).toHaveValue("Cardiology");
  });

  it("ties an error to the field, announces it, keeps what was typed and focuses it", async () => {
    const message = "A folder name cannot contain a slash (/).";
    const { user } = setup({ status: "error", error: message });
    const field = screen.getByRole("textbox", { name: "Folder name" });
    await user.type(field, "Cardiac/Renal");
    await user.click(screen.getByRole("button", { name: "Create folder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(message);
    expect(field).toHaveValue("Cardiac/Renal");
    expect(field).toHaveFocus();
  });
});
