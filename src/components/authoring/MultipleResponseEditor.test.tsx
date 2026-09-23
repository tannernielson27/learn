import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyMultipleResponseForm,
  toMultipleResponseForm,
} from "@/lib/authoring/forms/multipleResponse";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleResponseItemSchema } from "@/lib/ngn/schemas";
import { MultipleResponseEditor, type MultipleResponseEditorProps } from "./MultipleResponseEditor";
import { renderersLoaded } from "@/components/question/testing/renderers";

function setup(props: Partial<MultipleResponseEditorProps> = {}) {
  const onSaveDraft = vi.fn<MultipleResponseEditorProps["onSaveDraft"]>(async () => ({ ok: true }));
  const onPublish = vi.fn<MultipleResponseEditorProps["onPublish"]>(async () => ({ ok: true }));
  render(
    <MultipleResponseEditor
      initialValues={emptyMultipleResponseForm("mr_new")}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
      {...props}
    />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

describe("MultipleResponseEditor", () => {
  it("offers the stem, the answer style, and five options each with a correct checkbox", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Question stem" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Select all that apply" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Select a set number" })).not.toBeChecked();
    for (const letter of ["A", "B", "C", "D", "E"]) {
      expect(screen.getByRole("textbox", { name: `Option ${letter}` })).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: `Option ${letter} is correct` }),
      ).not.toBeChecked();
    }
  });

  it("asks for the count only for Select N", async () => {
    const { user } = setup();
    expect(
      screen.queryByRole("spinbutton", { name: "How many to select" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Select a set number" }));
    expect(screen.getByRole("spinbutton", { name: "How many to select" })).toBeInTheDocument();
  });

  it("uses multiple response wording for problems", () => {
    setup();
    const problems = screen.getByRole("region", { name: "Problems to fix" });
    expect(
      within(problems).getByRole("button", { name: "Mark at least one option as correct." }),
    ).toBeInTheDocument();
    expect(
      within(problems).queryByRole("button", { name: "Choose the correct option." }),
    ).not.toBeInTheDocument();
  });

  it("previews the item with the same player, as it is typed", async () => {
    const { user } = setup();
    await renderersLoaded();
    const preview = screen.getByRole("region", { name: "Preview" });
    await user.type(
      screen.getByRole("textbox", { name: "Question stem" }),
      "Which findings need follow-up?",
    );
    await user.type(screen.getByRole("textbox", { name: "Option A" }), "Respiratory rate 28");
    expect(within(preview).getByText("Which findings need follow-up?")).toBeInTheDocument();
    expect(within(preview).getByText("Respiratory rate 28")).toBeInTheDocument();
  });

  it("publishes a complete item as schema-valid input", async () => {
    const valid = toMultipleResponseForm(
      multipleResponseItemSchema.parse(FIXTURES.multiple_response.canonical),
    );
    const { user, onPublish } = setup({ initialValues: valid });
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(multipleResponseItemSchema.safeParse(onPublish.mock.calls[0][0]).success).toBe(true);
  });
});
