import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyMultipleChoiceForm,
  toMultipleChoiceForm,
} from "@/lib/authoring/forms/multipleChoice";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { MultipleChoiceEditor, type MultipleChoiceEditorProps } from "./MultipleChoiceEditor";

// EditorShell is exercised through the multiple choice editor, which every editor now shares it with.
describe("EditorShell when a save or publish request itself fails", () => {
  it("shows an error and lets the author try again when Save draft rejects", async () => {
    const onSaveDraft = vi
      .fn<MultipleChoiceEditorProps["onSaveDraft"]>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(
      <MultipleChoiceEditor
        initialValues={emptyMultipleChoiceForm("mc_new")}
        onSaveDraft={onSaveDraft}
        onPublish={vi.fn(async () => ({ ok: true }))}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The draft could not be saved. Try again.",
    );
    const save = screen.getByRole("button", { name: "Save draft" });
    expect(save).toBeEnabled();

    await user.click(save);
    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved.");
    expect(onSaveDraft).toHaveBeenCalledTimes(2);
  });

  it("shows an error and re-enables Publish when Publish rejects", async () => {
    const valid = toMultipleChoiceForm(
      multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical),
    );
    const onPublish = vi
      .fn<MultipleChoiceEditorProps["onPublish"]>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(
      <MultipleChoiceEditor
        initialValues={valid}
        onSaveDraft={vi.fn(async () => ({ ok: true }))}
        onPublish={onPublish}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The item could not be published. Try again.",
    );
    expect(screen.getByRole("button", { name: "Publish" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });
});
