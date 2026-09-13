import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyGroupingForm, toGroupingForm } from "@/lib/authoring/forms/multipleResponseGrouping";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleResponseGroupingItemSchema } from "@/lib/ngn/schemas";
import { GroupingEditor, type GroupingEditorProps } from "./GroupingEditor";

function setup(props: Partial<GroupingEditorProps> = {}) {
  const onSaveDraft = vi.fn<GroupingEditorProps["onSaveDraft"]>(async () => ({ ok: true }));
  const onPublish = vi.fn<GroupingEditorProps["onPublish"]>(async () => ({ ok: true }));
  render(
    <GroupingEditor
      initialValues={emptyGroupingForm("mrg_new")}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
      {...props}
    />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

describe("GroupingEditor", () => {
  it("offers a name and options for each group, each option with a correct checkbox", () => {
    setup();
    for (const group of [1, 2]) {
      const fieldset = screen.getByRole("group", { name: `Group ${group}` });
      expect(within(fieldset).getByRole("textbox", { name: "Group name" })).toBeInTheDocument();
      for (const letter of ["A", "B"]) {
        expect(
          within(fieldset).getByRole("textbox", { name: `Option ${letter}` }),
        ).toBeInTheDocument();
        expect(
          within(fieldset).getByRole("checkbox", { name: `Option ${letter} is correct` }),
        ).toBeInTheDocument();
      }
    }
  });

  it("adds a group and an option within a group", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add group" }));
    expect(screen.getByRole("group", { name: "Group 3" })).toBeInTheDocument();
    const first = screen.getByRole("group", { name: "Group 1" });
    await user.click(within(first).getByRole("button", { name: "Add option to group 1" }));
    expect(within(first).getByRole("textbox", { name: "Option C" })).toBeInTheDocument();
  });

  it("previews the item with the same player, as it is typed", async () => {
    const { user } = setup();
    const preview = screen.getByRole("region", { name: "Preview" });
    const first = screen.getByRole("group", { name: "Group 1" });
    await user.type(within(first).getByRole("textbox", { name: "Group name" }), "Respiratory");
    await user.type(
      within(first).getByRole("textbox", { name: "Option A" }),
      "Deep, rapid respirations",
    );
    // The player shows a group's name in more than one place, so any occurrence will do.
    expect(within(preview).getAllByText("Respiratory").length).toBeGreaterThan(0);
    expect(within(preview).getAllByText("Deep, rapid respirations").length).toBeGreaterThan(0);
  });

  it("publishes a complete item as schema-valid input", async () => {
    const valid = toGroupingForm(
      multipleResponseGroupingItemSchema.parse(FIXTURES.multiple_response_grouping.canonical),
    );
    const { user, onPublish } = setup({ initialValues: valid });
    expect(screen.queryByRole("region", { name: "Problems to fix" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(multipleResponseGroupingItemSchema.safeParse(onPublish.mock.calls[0][0]).success).toBe(
      true,
    );
  });

  it("lists problems for an empty item and keeps Publish unavailable", () => {
    setup();
    expect(screen.getByRole("region", { name: "Problems to fix" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
