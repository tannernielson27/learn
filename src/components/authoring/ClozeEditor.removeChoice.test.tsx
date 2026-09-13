import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyClozeForm, type ClozeFormValues } from "@/lib/authoring/forms/cloze";
import { ClozeEditor } from "./ClozeEditor";

function setup() {
  const onSaveDraft = vi.fn<(values: ClozeFormValues) => Promise<{ ok: boolean }>>(async () => ({
    ok: true,
  }));
  render(
    <ClozeEditor
      type="dropdown_cloze"
      initialValues={emptyClozeForm("ddc_new")}
      onSaveDraft={onSaveDraft}
      onPublish={vi.fn<(item: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }))}
    />,
  );
  return { onSaveDraft, user: userEvent.setup() };
}

describe("ClozeEditor removing a choice", () => {
  it("clears the blank's answer when the chosen choice is removed", async () => {
    const { onSaveDraft, user } = setup();
    const blank = screen.getByRole("group", { name: /Blank 1/ });
    await user.click(within(blank).getByRole("button", { name: "Add choice to blank 1" }));
    await user.click(within(blank).getByRole("radio", { name: "Choice D is correct" }));
    await user.click(within(blank).getByRole("button", { name: "Remove choice D from blank 1" }));

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft.mock.calls[0][0].blanks[0].correctChoiceId).toBe("");
  });

  it("keeps the blank's answer when a different choice is removed", async () => {
    const { onSaveDraft, user } = setup();
    const blank = screen.getByRole("group", { name: /Blank 1/ });
    await user.click(within(blank).getByRole("radio", { name: "Choice A is correct" }));
    await user.click(within(blank).getByRole("button", { name: "Add choice to blank 1" }));
    await user.click(within(blank).getByRole("button", { name: "Remove choice D from blank 1" }));

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft.mock.calls[0][0].blanks[0].correctChoiceId).toBe("blank_1_a");
  });
});
