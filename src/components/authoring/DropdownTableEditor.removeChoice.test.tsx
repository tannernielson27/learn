import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyDropdownTableForm } from "@/lib/authoring/forms/dropdownTable";
import { DropdownTableEditor, type DropdownTableEditorProps } from "./DropdownTableEditor";

function setup() {
  const onSaveDraft = vi.fn<DropdownTableEditorProps["onSaveDraft"]>(async () => ({ ok: true }));
  render(
    <DropdownTableEditor
      initialValues={emptyDropdownTableForm("ddt_new")}
      onSaveDraft={onSaveDraft}
      onPublish={vi.fn(async () => ({ ok: true }))}
    />,
  );
  return { onSaveDraft, user: userEvent.setup() };
}

describe("DropdownTableEditor removing a choice", () => {
  it("clears the row's answer when the chosen choice is removed", async () => {
    const { onSaveDraft, user } = setup();
    const row = screen.getByRole("group", { name: "Row 1" });
    await user.click(within(row).getByRole("button", { name: "Add choice to row 1" }));
    await user.click(within(row).getByRole("radio", { name: "Choice C is correct" }));
    await user.click(within(row).getByRole("button", { name: "Remove choice C from row 1" }));

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft.mock.calls[0][0].rows[0].correctChoiceId).toBe("");
  });

  it("keeps the row's answer when a different choice is removed", async () => {
    const { onSaveDraft, user } = setup();
    const row = screen.getByRole("group", { name: "Row 1" });
    await user.click(within(row).getByRole("radio", { name: "Choice A is correct" }));
    await user.click(within(row).getByRole("button", { name: "Add choice to row 1" }));
    await user.click(within(row).getByRole("button", { name: "Remove choice C from row 1" }));

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft.mock.calls[0][0].rows[0].correctChoiceId).toBe("row_1_a");
  });
});
