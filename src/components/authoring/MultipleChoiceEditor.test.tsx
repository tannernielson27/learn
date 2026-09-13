import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyMultipleChoiceForm,
  toMultipleChoiceForm,
} from "@/lib/authoring/forms/multipleChoice";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { MultipleChoiceEditor, type MultipleChoiceEditorProps } from "./MultipleChoiceEditor";

function setup(props: Partial<MultipleChoiceEditorProps> = {}) {
  const onSaveDraft = vi.fn<MultipleChoiceEditorProps["onSaveDraft"]>(async () => ({ ok: true }));
  const onPublish = vi.fn<MultipleChoiceEditorProps["onPublish"]>(async () => ({ ok: true }));
  render(
    <MultipleChoiceEditor
      initialValues={emptyMultipleChoiceForm("mc_new")}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
      {...props}
    />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

describe("MultipleChoiceEditor", () => {
  it("offers a labelled field for the stem, each option and the correct answer", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Question stem" })).toBeInTheDocument();
    for (const letter of ["A", "B", "C", "D"]) {
      expect(screen.getByRole("textbox", { name: `Option ${letter}` })).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: `Option ${letter} is correct` }),
      ).toBeInTheDocument();
    }
  });

  it("shows the item in the preview as it is typed, without remounting the player", async () => {
    const { user } = setup();
    const preview = screen.getByRole("region", { name: "Preview" });
    const before = within(preview).getByRole("radiogroup", { name: "Options" });
    await user.type(
      screen.getByRole("textbox", { name: "Question stem" }),
      "Which action comes first?",
    );
    await user.type(screen.getByRole("textbox", { name: "Option A" }), "Assess the airway");
    expect(within(preview).getByText("Which action comes first?")).toBeInTheDocument();
    expect(within(preview).getByText("Assess the airway")).toBeInTheDocument();
    expect(within(preview).getByRole("radiogroup", { name: "Options" })).toBe(before);
  });

  it("lists what is missing in plain words, and each problem moves focus to its field", async () => {
    const { user } = setup();
    const problems = screen.getByRole("region", { name: "Problems to fix" });
    expect(
      within(problems).getByRole("button", { name: "Write the question stem." }),
    ).toBeInTheDocument();
    expect(
      within(problems).getByRole("button", { name: "Choose the correct option." }),
    ).toBeInTheDocument();
    await user.click(within(problems).getByRole("button", { name: "Write the question stem." }));
    expect(screen.getByRole("textbox", { name: "Question stem" })).toHaveFocus();
  });

  it("keeps Publish unavailable until the item is valid", async () => {
    const { user, onPublish } = setup();
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toHaveAttribute("aria-disabled", "true");
    await user.click(publish);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("publishes a complete item as schema-valid input", async () => {
    const valid = toMultipleChoiceForm(
      multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical),
    );
    const { user, onPublish } = setup({ initialValues: valid });
    expect(screen.queryByRole("region", { name: "Problems to fix" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(multipleChoiceItemSchema.safeParse(onPublish.mock.calls[0][0]).success).toBe(true);
  });

  it("saves a draft even when the item is incomplete, and never publishes it", async () => {
    const { user, onSaveDraft, onPublish } = setup();
    await user.type(screen.getByRole("textbox", { name: "Question stem" }), "Half written");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onPublish).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved.");
  });

  it("marks unsaved changes", async () => {
    const { user } = setup();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Option B" }), "x");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("keeps what was typed while a save was still in flight, and keeps it marked unsaved", async () => {
    let finishSave: (result: { ok: boolean }) => void = () => {};
    const onSaveDraft = vi.fn<MultipleChoiceEditorProps["onSaveDraft"]>(
      () => new Promise((resolve) => (finishSave = resolve)),
    );
    const { user } = setup({ onSaveDraft });
    const stem = screen.getByRole("textbox", { name: "Question stem" });
    await user.type(stem, "First");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await user.type(stem, " and more");
    finishSave({ ok: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved.");
    expect(stem).toHaveValue("First and more");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("describes each flagged field with its problem, for screen readers", () => {
    setup();
    const stem = screen.getByRole("textbox", { name: "Question stem" });
    expect(stem).toHaveAttribute("aria-invalid", "true");
    expect(stem).toHaveAccessibleDescription("Write the question stem.");
    expect(screen.getByRole("textbox", { name: "Option A" })).toHaveAccessibleDescription(
      "Option A needs text.",
    );
    expect(screen.getByRole("radio", { name: "Option A is correct" })).toHaveAccessibleDescription(
      "Choose the correct option.",
    );
  });
});
