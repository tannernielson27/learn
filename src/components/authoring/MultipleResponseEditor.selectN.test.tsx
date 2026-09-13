import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyMultipleResponseForm } from "@/lib/authoring/forms/multipleResponse";
import { MultipleResponseEditor, type MultipleResponseEditorProps } from "./MultipleResponseEditor";

describe("MultipleResponseEditor Select N count", () => {
  it("still saves a draft while the count is blank, and asks for the count as a problem", async () => {
    const onSaveDraft = vi.fn<MultipleResponseEditorProps["onSaveDraft"]>(async () => ({
      ok: true,
    }));
    const user = userEvent.setup();
    render(
      <MultipleResponseEditor
        initialValues={emptyMultipleResponseForm("mr_new")}
        onSaveDraft={onSaveDraft}
        onPublish={vi.fn(async () => ({ ok: true }))}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Select a set number" }));
    await user.clear(screen.getByRole("spinbutton", { name: "How many to select" }));

    const problems = screen.getByRole("region", { name: "Problems to fix" });
    expect(
      within(problems).getByRole("button", {
        name: "Choose how many options to select. It must be fewer than the number of options.",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0][0].n).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved.");
  });
});
