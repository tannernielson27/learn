import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toMultipleChoiceForm } from "@/lib/authoring/forms/multipleChoice";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import type { SaveResult } from "./EditorShell";
import { ItemEditorHostContext } from "./ItemEditorHost";
import { MultipleChoiceEditor } from "./MultipleChoiceEditor";

const form = () =>
  toMultipleChoiceForm(multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical));

// #347: a staged AI import question is saved back to its entry, never published from here.
function SaveOnly({ save }: { save: () => Promise<SaveResult> }) {
  return (
    <ItemEditorHostContext.Provider value={{ inCaseStudy: false, saveOnly: true }}>
      <MultipleChoiceEditor initialValues={form()} onSaveDraft={save} onPublish={vi.fn()} />
    </ItemEditorHostContext.Provider>
  );
}

describe("EditorShell with Save only", () => {
  it("offers Save and no Publish", () => {
    render(<SaveOnly save={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
  });

  it("does not ask for a rationale, which only publishing needs", () => {
    render(
      <ItemEditorHostContext.Provider value={{ inCaseStudy: false, saveOnly: true }}>
        <MultipleChoiceEditor
          initialValues={{ ...form(), rationaleGeneral: "" }}
          onSaveDraft={vi.fn()}
          onPublish={vi.fn()}
        />
      </ItemEditorHostContext.Provider>,
    );
    expect(screen.queryByRole("region", { name: "Problems to fix" })).not.toBeInTheDocument();
  });

  it("says what the save made of the question", async () => {
    const user = userEvent.setup({ delay: null });
    const save = vi.fn(async () => ({ ok: true, message: "Saved. It is ready to import." }));
    render(<SaveOnly save={save} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Saved. It is ready to import.");
  });

  it("says Saved when the host gives no words, and shows a refusal", async () => {
    const user = userEvent.setup({ delay: null });
    const save = vi
      .fn<() => Promise<SaveResult>>()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "This question changed in another tab." });
    render(<SaveOnly save={save} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This question changed in another tab.",
    );
  });
});
