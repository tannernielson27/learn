import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyHighlightTextForm,
  type HighlightTextFormValues,
} from "@/lib/authoring/forms/highlight";
import { highlightTextItemSchema } from "@/lib/ngn/schemas";
import { HighlightTextEditor } from "./HighlightTextEditor";
import { renderersLoaded } from "@/components/question/testing/renderers";

function setup(initialValues: HighlightTextFormValues = emptyHighlightTextForm("ht_new")) {
  const onSaveDraft = vi.fn<(values: HighlightTextFormValues) => Promise<{ ok: boolean }>>(
    async () => ({ ok: true }),
  );
  const onPublish = vi.fn<(item: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
  render(
    <HighlightTextEditor
      initialValues={initialValues}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
    />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

const passage = () => screen.getByRole("textbox", { name: "Passage" }) as HTMLTextAreaElement;
const withPassage = (text: string, correctSpanIds: string[] = []) => ({
  ...emptyHighlightTextForm("ht_new"),
  stem: "Highlight the findings that need follow-up.",
  passage: text,
  correctSpanIds,
  rationaleGeneral: "Fever and cough both point to infection.",
});

describe("HighlightTextEditor", () => {
  it("offers the stem, the passage and Mark span", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Question stem" })).toBeInTheDocument();
    expect(passage()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark span" })).toBeInTheDocument();
  });

  it("marks the selected phrase as a span, listed with its own correct checkbox", async () => {
    const { user } = setup();
    await user.click(passage());
    await user.paste("Pulse 120 today");
    passage().setSelectionRange(6, 9);
    await user.click(screen.getByRole("button", { name: "Mark span" }));
    expect(passage()).toHaveValue("Pulse [[120|span_1]] today");
    expect(screen.getByRole("checkbox", { name: "120 is correct" })).not.toBeChecked();
  });

  it("says to select a phrase first when nothing is selected", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Mark span" }));
    expect(screen.getByRole("status")).toHaveTextContent("Select a phrase in the passage first.");
  });

  it("previews each span as a phrase the student can press", async () => {
    setup(withPassage("[[fever|a]] and [[cough|b]]"));
    await renderersLoaded();
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(within(preview).getByRole("button", { name: "fever" })).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: "cough" })).toBeInTheDocument();
  });

  it("removing a span unwraps its phrase and clears its answer", async () => {
    const { onSaveDraft, user } = setup(withPassage("[[fever|a]] and [[cough|b]]", ["a"]));
    await user.click(screen.getByRole("button", { name: "Remove span fever" }));
    expect(passage()).toHaveValue("fever and [[cough|b]]");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft.mock.calls[0][0].correctSpanIds).toEqual([]);
  });

  it("tells apart two spans with the same phrase, and lists a hand-typed duplicate id once per span", async () => {
    const { onSaveDraft, user } = setup(withPassage("[[pain|a]] at rest, [[pain|b]] on walking"));
    await user.click(screen.getByRole("checkbox", { name: "pain (2) is correct" }));
    expect(screen.getByRole("checkbox", { name: "pain is correct" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Remove span pain (2)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft.mock.calls[0][0].correctSpanIds).toEqual(["b"]);
  });

  it("keeps a rationale per span", async () => {
    const { onSaveDraft, user } = setup(withPassage("[[fever|a]] and [[cough|b]]", ["a"]));
    await user.type(
      screen.getByRole("textbox", { name: "Why fever is right or wrong (optional)" }),
      "A temperature over 38 °C.",
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft.mock.calls[0][0].spanRationales).toEqual({ a: "A temperature over 38 °C." });
  });

  it("warns, without blocking Publish, when most phrases are correct", () => {
    setup(withPassage("[[fever|a]] and [[cough|b]]", ["a", "b"]));
    expect(
      screen.getByText(
        "2 of 2 phrases are marked correct. Items work best when most phrases are not.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("publishes a valid item once a phrase is marked correct", async () => {
    const { onPublish, user } = setup(withPassage("[[fever|a]] and [[cough|b]]"));
    expect(screen.getByRole("button", { name: "Publish" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(screen.getByRole("checkbox", { name: "fever is correct" }));
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(highlightTextItemSchema.safeParse(onPublish.mock.calls[0][0]).success).toBe(true);
  });
});
