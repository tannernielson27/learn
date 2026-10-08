import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { toMultipleChoiceForm } from "@/lib/authoring/forms/multipleChoice";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { ItemEditorHostContext } from "./ItemEditorHost";
import { MultipleChoiceEditor } from "./MultipleChoiceEditor";

const saved = () =>
  toMultipleChoiceForm(multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical));

const WARNING =
  "This item is published. Saving a draft takes it out of sessions, assignments and practice until you publish again.";

// The host owns whether the item is published, as ItemEditorWithHistory does.
function Hosted({ published: initial }: { published: boolean }) {
  const [published, setPublished] = useState(initial);
  return (
    <ItemEditorHostContext.Provider
      value={{ inCaseStudy: false, published, onPublishedChange: setPublished }}
    >
      <MultipleChoiceEditor
        initialValues={saved()}
        onSaveDraft={vi.fn(async () => ({ ok: true }))}
        onPublish={vi.fn(async () => ({ ok: true }))}
      />
    </ItemEditorHostContext.Provider>
  );
}

describe("EditorShell on a published item", () => {
  it("warns beside Save draft that saving a draft unpublishes the item", () => {
    render(<Hosted published />);
    expect(screen.getByText(WARNING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toHaveAccessibleDescription(WARNING);
  });

  it("says the item is a draft again once saved, and drops the warning", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Hosted published />);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved as a draft. Publish to use it again.",
    );
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it("warns again once the draft is published", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Hosted published={false} />);
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Published.");
    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });

  it("gives no warning for a draft, and keeps the plain saved message", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Hosted published={false} />);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved.");
  });
});

describe("EditorShell's save message", () => {
  it("goes once the author changes the item again, leaving only Unsaved changes", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Hosted published={false} />);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Draft saved.")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Question stem" }), " more");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.queryByText("Draft saved.")).not.toBeInTheDocument();
  });
});
