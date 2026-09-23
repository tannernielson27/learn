import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyOrderedResponseForm,
  toOrderedResponseForm,
  type OrderedResponseFormValues,
} from "@/lib/authoring/forms/orderedResponse";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { orderedResponseItemSchema } from "@/lib/ngn/schemas";
import { OrderedResponseEditor } from "./OrderedResponseEditor";
import { renderersLoaded } from "@/components/question/testing/renderers";

function setup(initialValues: OrderedResponseFormValues = emptyOrderedResponseForm("or_new")) {
  const onSaveDraft = vi.fn<(values: OrderedResponseFormValues) => Promise<{ ok: boolean }>>(
    async () => ({ ok: true }),
  );
  const onPublish = vi.fn<(item: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
  render(
    <OrderedResponseEditor
      initialValues={initialValues}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
    />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

const edge = () =>
  toOrderedResponseForm(orderedResponseItemSchema.parse(FIXTURES.ordered_response.edge));

describe("OrderedResponseEditor", () => {
  it("offers four steps in order, with Up and Down named for the step they move", () => {
    setup();
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByRole("textbox", { name: `Step ${n}` })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Move step 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move step 4 down" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Remove step/ })).not.toBeInTheDocument();
  });

  it("moves a step down by keyboard, changing the key, and says where it went", async () => {
    const { onSaveDraft, user } = setup(edge());
    screen.getByRole("button", { name: "Move step 2 down" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Step 3" })).toHaveValue(
      "Perform hand hygiene and prepare the medication",
    );
    // The preview's player has its own status region, so look for the editor's message itself.
    expect(screen.getByText("Step moved to position 3.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft.mock.calls[0][0].steps.map((step) => step.id)).toEqual([
      "s1",
      "s3",
      "s2",
      "s4",
    ]);
  });

  it("adds up to six steps and removes down to four", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.click(screen.getByRole("button", { name: "Add step" }));
    expect(screen.getByRole("textbox", { name: "Step 6" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add step" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove step 6" }));
    expect(screen.queryByRole("textbox", { name: "Step 6" })).not.toBeInTheDocument();
  });

  it("previews the steps for the student to put in order", async () => {
    setup(edge());
    await renderersLoaded();
    const preview = screen.getByRole("region", { name: "Preview" });
    const list = within(preview).getByRole("list", { name: "Steps in order" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });

  it("publishes the per-position fixture unchanged", async () => {
    const { onPublish, user } = setup(edge());
    expect(
      screen.getByRole("checkbox", { name: "Give a point for each step in the right place" }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(orderedResponseItemSchema.parse(onPublish.mock.calls[0][0])).toEqual(
      orderedResponseItemSchema.parse(FIXTURES.ordered_response.edge),
    );
  });
});
