import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyDragDropForm,
  toDragDropForm,
  type DragDropFormValues,
} from "@/lib/authoring/forms/dragdrop";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { dragdropClozeItemSchema, dragdropRationaleItemSchema } from "@/lib/ngn/schemas";
import { DragDropEditor } from "./DragDropEditor";

function setup(
  type: "dragdrop_cloze" | "dragdrop_rationale",
  initialValues: DragDropFormValues = emptyDragDropForm("dcz_new"),
) {
  const onSaveDraft = vi.fn<(values: DragDropFormValues) => Promise<{ ok: boolean }>>(async () => ({
    ok: true,
  }));
  const onPublish = vi.fn<(item: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
  render(
    <DragDropEditor
      type={type}
      initialValues={initialValues}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
    />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

const canonicalCloze = () =>
  toDragDropForm(dragdropClozeItemSchema.parse(FIXTURES.dragdrop_cloze.canonical));

describe("DragDropEditor", () => {
  it("offers the sentence, a word bank of four words, and a correct word per blank", () => {
    setup("dragdrop_cloze");
    expect(screen.getByRole("textbox", { name: "Sentence" })).toHaveValue("{{blank_1}}");
    const bank = screen.getByRole("group", { name: "Word bank words" });
    for (const n of [1, 2, 3, 4]) {
      expect(within(bank).getByRole("textbox", { name: `Word ${n}` })).toBeInTheDocument();
    }
    expect(screen.getByRole("combobox", { name: "Correct word for blank 1" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Let a word fill more than one blank" }),
    ).not.toBeChecked();
  });

  it("lists the bank's words as the choices for each blank", async () => {
    const { user } = setup("dragdrop_cloze");
    await user.type(screen.getByRole("textbox", { name: "Word 1" }), "oxygen");
    const select = screen.getByRole("combobox", { name: "Correct word for blank 1" });
    expect(within(select).getByRole("option", { name: "oxygen" })).toBeInTheDocument();
    await user.selectOptions(select, "oxygen");
    expect(select).toHaveValue("tok_1");
  });

  it("previews the sentence with its blanks and the word bank the student drags from", () => {
    setup("dragdrop_cloze", canonicalCloze());
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(
      within(preview).getByRole("button", { name: "Blank 1 of 2, empty" }),
    ).toBeInTheDocument();
    const bank = within(preview).getByRole("group", { name: "Word bank" });
    expect(
      within(bank).getByRole("button", { name: "a short-acting beta agonist" }),
    ).toBeInTheDocument();
  });

  it("removing the chosen word clears that blank's answer", async () => {
    const { onSaveDraft, user } = setup("dragdrop_cloze", canonicalCloze());
    // tok_saba is word 1 and blank 1's answer.
    await user.click(screen.getByRole("button", { name: "Remove word 1" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    const saved = onSaveDraft.mock.calls[0][0];
    expect(saved.bank.map((token) => token.id)).not.toContain("tok_saba");
    expect(saved.blanks[0].correctTokenId).toBe("");
    expect(saved.blanks[1].correctTokenId).toBe("tok_fowler");
  });

  it("will not remove a word below the bank's minimum of four", () => {
    setup("dragdrop_cloze");
    expect(screen.queryByRole("button", { name: /Remove word/ })).not.toBeInTheDocument();
  });

  it("refuses one word for two blanks unless words may be reused", async () => {
    const form = canonicalCloze();
    const same = {
      ...form,
      blanks: form.blanks.map((b) => ({ ...b, correctTokenId: "tok_saba" })),
    };
    const { user } = setup("dragdrop_cloze", same);
    const problems = screen.getByRole("region", { name: "Problems to fix" });
    expect(
      within(problems).getByRole("button", {
        name: "Blank 2 uses the same word as another blank. Choose a different word, or let words be reused.",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Let a word fill more than one blank" }));
    expect(screen.queryByRole("region", { name: "Problems to fix" })).not.toBeInTheDocument();
  });

  it("offers Remove blank for a blank whose marker was typed away, even at the minimum", async () => {
    const { onSaveDraft, user } = setup("dragdrop_cloze");
    expect(screen.queryByRole("button", { name: "Remove blank 1" })).not.toBeInTheDocument();
    const sentence = screen.getByRole("textbox", { name: "Sentence" });
    await user.clear(sentence);
    await user.type(sentence, "Give oxygen now");
    await user.click(screen.getByRole("button", { name: "Remove blank 1" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft.mock.calls[0][0].blanks).toEqual([]);
  });

  it("publishes the rationale triad fixture unchanged, anchor included", async () => {
    const item = dragdropRationaleItemSchema.parse(FIXTURES.dragdrop_rationale.edge);
    const { onPublish, user } = setup("dragdrop_rationale", toDragDropForm(item));
    expect(
      screen.getAllByRole("radio", { name: "This blank is the anchor the others support" }),
    ).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(dragdropRationaleItemSchema.parse(onPublish.mock.calls[0][0])).toEqual(item);
  });
});
