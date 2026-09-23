import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyDropdownTableForm, toDropdownTableForm } from "@/lib/authoring/forms/dropdownTable";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { dropdownTableItemSchema } from "@/lib/ngn/schemas";
import { DropdownTableEditor, type DropdownTableEditorProps } from "./DropdownTableEditor";
import { renderersLoaded } from "@/components/question/testing/renderers";

function setup(props: Partial<DropdownTableEditorProps> = {}) {
  const onSaveDraft = vi.fn<DropdownTableEditorProps["onSaveDraft"]>(async () => ({ ok: true }));
  const onPublish = vi.fn<DropdownTableEditorProps["onPublish"]>(async () => ({ ok: true }));
  render(
    <DropdownTableEditor
      initialValues={emptyDropdownTableForm("ddt_new")}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
      {...props}
    />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

describe("DropdownTableEditor", () => {
  it("offers both headings, and text and choices for each row", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Row heading" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Drop-down heading" })).toBeInTheDocument();
    for (const row of [1, 2]) {
      const fieldset = screen.getByRole("group", { name: `Row ${row}` });
      expect(within(fieldset).getByRole("textbox", { name: "Row text" })).toBeInTheDocument();
      for (const letter of ["A", "B"]) {
        expect(
          within(fieldset).getByRole("textbox", { name: `Choice ${letter}` }),
        ).toBeInTheDocument();
        expect(
          within(fieldset).getByRole("radio", { name: `Choice ${letter} is correct` }),
        ).toBeInTheDocument();
      }
    }
  });

  it("adds a row, and a choice within a row", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add row" }));
    expect(screen.getByRole("group", { name: "Row 3" })).toBeInTheDocument();
    const first = screen.getByRole("group", { name: "Row 1" });
    await user.click(within(first).getByRole("button", { name: "Add choice to row 1" }));
    expect(within(first).getByRole("textbox", { name: "Choice C" })).toBeInTheDocument();
  });

  it("previews the table with the same player, as it is typed", async () => {
    const { user } = setup();
    await renderersLoaded();
    const preview = screen.getByRole("region", { name: "Preview" });
    await user.type(screen.getByRole("textbox", { name: "Row heading" }), "Medication");
    await user.type(
      within(screen.getByRole("group", { name: "Row 1" })).getByRole("textbox", {
        name: "Row text",
      }),
      "Digoxin 0.125 mg PO",
    );
    expect(within(preview).getAllByText("Medication").length).toBeGreaterThan(0);
    expect(within(preview).getAllByText("Digoxin 0.125 mg PO").length).toBeGreaterThan(0);
  });

  it("uses dropdown table wording for problems", () => {
    setup();
    const problems = screen.getByRole("region", { name: "Problems to fix" });
    expect(
      within(problems).getByRole("button", { name: "Name the row heading." }),
    ).toBeInTheDocument();
    expect(
      within(problems).getByRole("button", { name: "Choose the correct choice for row 1." }),
    ).toBeInTheDocument();
  });

  it("publishes a complete table as schema-valid input", async () => {
    const valid = toDropdownTableForm(
      dropdownTableItemSchema.parse(FIXTURES.dropdown_table.canonical),
    );
    const { user, onPublish } = setup({ initialValues: valid });
    expect(screen.queryByRole("region", { name: "Problems to fix" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(dropdownTableItemSchema.safeParse(onPublish.mock.calls[0][0]).success).toBe(true);
  });
});
