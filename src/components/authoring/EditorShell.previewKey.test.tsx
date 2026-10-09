import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toMultipleChoiceForm } from "@/lib/authoring/forms/multipleChoice";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { feedbackShown } from "@/components/question/testing/feedback";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { MultipleChoiceEditor } from "./MultipleChoiceEditor";

// The canonical fixture's key is option A, "Auscultate the lungs"; option C is "Document the weight".
async function setup() {
  render(
    <MultipleChoiceEditor
      initialValues={toMultipleChoiceForm(
        multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical),
      )}
      onSaveDraft={vi.fn(async () => ({ ok: true }))}
      onPublish={vi.fn(async () => ({ ok: true }))}
    />,
  );
  await renderersLoaded();
  return { user: userEvent.setup(), preview: screen.getByRole("region", { name: "Preview" }) };
}

async function submitInPreview(user: ReturnType<typeof userEvent.setup>, preview: HTMLElement) {
  await user.click(within(preview).getByRole("radio", { name: /Document the weight/ }));
  await user.click(within(preview).getByRole("button", { name: "Submit" }));
  await feedbackShown();
}

describe("the preview after the answer key is edited (#326)", () => {
  it("drops the marks of a submit scored with the old key", async () => {
    const { user, preview } = await setup();
    await submitInPreview(user, preview);
    expect(within(preview).getByText("Incorrect")).toBeInTheDocument();
    expect(within(preview).getByText("Missed")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Option C is correct" }));
    await renderersLoaded();

    // Marked against key A, the pick would still read Incorrect with A shown as Missed.
    expect(within(preview).queryByText("Incorrect")).not.toBeInTheDocument();
    expect(within(preview).queryByText("Missed")).not.toBeInTheDocument();
    expect(within(preview).queryByRole("complementary", { name: "Score" })).not.toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("scores the next submit with the new key", async () => {
    const { user, preview } = await setup();
    await submitInPreview(user, preview);
    await user.click(screen.getByRole("radio", { name: "Option C is correct" }));
    await renderersLoaded();

    await submitInPreview(user, preview);
    expect(within(preview).queryByText("Incorrect")).not.toBeInTheDocument();
    expect(
      within(preview).getByRole("complementary", { name: "Score" }),
    ).toHaveAccessibleDescription(/All correct/);
  });

  it("drops a shown rationale that has since been rewritten", async () => {
    const { user, preview } = await setup();
    await submitInPreview(user, preview);
    await user.type(screen.getByRole("textbox", { name: /^Rationale/ }), " More.");
    expect(within(preview).queryByRole("complementary", { name: "Score" })).not.toBeInTheDocument();
  });

  it("keeps the feedback in place while anything else is edited", async () => {
    const { user, preview } = await setup();
    await submitInPreview(user, preview);
    const score = within(preview).getByRole("complementary", { name: "Score" });
    await user.type(screen.getByRole("textbox", { name: "Question stem" }), " Now?");
    expect(within(preview).getByRole("complementary", { name: "Score" })).toBe(score);
    expect(within(preview).getByText("Incorrect")).toBeInTheDocument();
  });

  it("keeps an answer not yet submitted when the key is edited", async () => {
    const { user, preview } = await setup();
    await user.click(within(preview).getByRole("radio", { name: /Document the weight/ }));
    await user.click(screen.getByRole("radio", { name: "Option C is correct" }));
    expect(within(preview).getByRole("radio", { name: /Document the weight/ })).toBeChecked();
  });
});
