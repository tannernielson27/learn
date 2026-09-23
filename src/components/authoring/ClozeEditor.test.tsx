import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyClozeForm, toClozeForm } from "@/lib/authoring/forms/cloze";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { dropdownClozeItemSchema, dropdownRationaleItemSchema } from "@/lib/ngn/schemas";
import { ClozeEditor } from "./ClozeEditor";
import { renderersLoaded } from "@/components/question/testing/renderers";

function setup(
  type: "dropdown_cloze" | "dropdown_rationale",
  initialValues = emptyClozeForm("ddc_new"),
) {
  const onSaveDraft = vi.fn<(values: unknown) => Promise<{ ok: boolean }>>(async () => ({
    ok: true,
  }));
  const onPublish = vi.fn<(item: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
  render(
    <ClozeEditor
      type={type}
      initialValues={initialValues}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
    />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

const sentence = () => screen.getByRole("textbox", { name: "Sentence" }) as HTMLTextAreaElement;

describe("ClozeEditor", () => {
  it("starts with a sentence holding one blank, and that blank's choices", () => {
    setup("dropdown_cloze");
    expect(sentence()).toHaveValue("{{blank_1}}");
    const blank = screen.getByRole("group", { name: /Blank 1/ });
    for (const letter of ["A", "B", "C"]) {
      expect(within(blank).getByRole("textbox", { name: `Choice ${letter}` })).toBeInTheDocument();
      expect(
        within(blank).getByRole("radio", { name: `Choice ${letter} is correct` }),
      ).toBeInTheDocument();
    }
  });

  it("inserts a new blank where the cursor is, with its own choices", async () => {
    const { user } = setup("dropdown_cloze");
    await user.clear(sentence());
    await user.type(sentence(), "Give  now.");
    sentence().setSelectionRange(5, 5);
    await user.click(screen.getByRole("button", { name: "Insert blank" }));
    // blank_1 is already in the list (only its marker was cleared), so the new blank is blank_2.
    expect(sentence()).toHaveValue("Give {{blank_2}} now.");
    expect(screen.getByRole("group", { name: /Blank 2/ })).toBeInTheDocument();
  });

  it("removes a blank's marker from the sentence when the blank is removed", async () => {
    const valid = toClozeForm(dropdownClozeItemSchema.parse(FIXTURES.dropdown_cloze.canonical));
    const { user } = setup("dropdown_cloze", valid);
    expect(sentence().value).toContain("{{blank_2}}");
    await user.click(screen.getByRole("button", { name: "Remove blank 2" }));
    expect(sentence().value).not.toContain("{{blank_2}}");
  });

  it("previews each blank as a drop-down in the same player", async () => {
    const valid = toClozeForm(dropdownClozeItemSchema.parse(FIXTURES.dropdown_cloze.canonical));
    setup("dropdown_cloze", valid);
    await renderersLoaded();
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(
      within(preview).getAllByRole("combobox", { name: "Blank 1 of 2" }).length,
    ).toBeGreaterThan(0);
    expect(
      within(preview).getAllByRole("combobox", { name: "Blank 2 of 2" }).length,
    ).toBeGreaterThan(0);
  });

  it("offers an anchor choice only for drop-down rationale", () => {
    const triad = toClozeForm(
      dropdownRationaleItemSchema.parse(FIXTURES.dropdown_rationale.canonical),
    );
    setup("dropdown_rationale", triad);
    expect(
      screen.getAllByRole("radio", { name: "This blank is the anchor the others support" }),
    ).toHaveLength(3);
  });

  it("publishes a complete triad as schema-valid input", async () => {
    const triad = toClozeForm(
      dropdownRationaleItemSchema.parse(FIXTURES.dropdown_rationale.canonical),
    );
    const { user, onPublish } = setup("dropdown_rationale", triad);
    expect(screen.queryByRole("region", { name: "Problems to fix" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(dropdownRationaleItemSchema.safeParse(onPublish.mock.calls[0][0]).success).toBe(true);
  });
});
