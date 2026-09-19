import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toMultipleChoiceForm } from "@/lib/authoring/forms/multipleChoice";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { ItemEditorHostContext } from "./ItemEditorHost";
import { MultipleChoiceEditor } from "./MultipleChoiceEditor";

const saved = () =>
  toMultipleChoiceForm(multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical));
const restored = () => ({ ...saved(), stem: "The stem as version 1 had it" });

describe("an editor opened on a restored version", () => {
  it("shows the version as unsaved changes against the saved draft", async () => {
    const onSaveDraft = vi.fn(async () => ({ ok: true }));
    render(
      <ItemEditorHostContext.Provider value={{ inCaseStudy: false, savedValues: saved() }}>
        <MultipleChoiceEditor
          initialValues={restored()}
          onSaveDraft={onSaveDraft}
          onPublish={vi.fn(async () => ({ ok: true }))}
        />
      </ItemEditorHostContext.Provider>,
    );

    expect(screen.getByRole("textbox", { name: "Question stem" })).toHaveValue(
      "The stem as version 1 had it",
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    // Saving the restored version makes it the draft, and nothing is left unsaved.
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ stem: "The stem as version 1 had it" }),
    );
    expect(await screen.findByText("Draft saved.")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("is clean when the saved draft is what it opened with", () => {
    render(
      <ItemEditorHostContext.Provider value={{ inCaseStudy: false, savedValues: saved() }}>
        <MultipleChoiceEditor
          initialValues={saved()}
          onSaveDraft={vi.fn(async () => ({ ok: true }))}
          onPublish={vi.fn(async () => ({ ok: true }))}
        />
      </ItemEditorHostContext.Provider>,
    );
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });
});
