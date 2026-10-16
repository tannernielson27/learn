import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matrixFormFromStored } from "@/lib/authoring/forms/matrix";
import { fromMatrixMultipleChoiceDraft } from "@/lib/ngn/draft";
import { AiImportEntryEditor, type AiImportEntryEditorProps } from "./AiImportEntryEditor";
import type { ItemEditorSwitchProps } from "./ItemEditorSwitch";
import { MatrixEditor } from "./MatrixEditor";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

// The real matrix editor, drawn at once rather than through next/dynamic.
vi.mock("./ItemEditorSwitch", () => ({
  ItemEditorSwitch: ({ editor, onSaveDraft, onPublish }: ItemEditorSwitchProps) =>
    editor.type === "matrix_multiple_choice" ? (
      <MatrixEditor
        type={editor.type}
        initialValues={editor.initialValues}
        onSaveDraft={onSaveDraft}
        onPublish={onPublish}
      />
    ) : null,
}));

const BATCH = "00000000-0000-4000-8000-0000000000b1";
const ENTRY = "00000000-0000-4000-8000-0000000000e1";

// Fictional: the Malnutrition sample's shape, a matrix whose source marks no answer.
const keyless = fromMatrixMultipleChoiceDraft({
  type: "matrix_multiple_choice",
  stem: "For each finding, choose whether it is expected or unexpected.",
  columns: ["Expected", "Unexpected"],
  rows: [
    { text: "Weight loss of 3 kg", cells: ["", ""] },
    { text: "Brisk capillary refill", cells: ["", ""] },
  ],
}).item;

function props(over: Partial<AiImportEntryEditorProps> = {}): AiImportEntryEditorProps {
  return {
    batchId: BATCH,
    entryId: ENTRY,
    version: 3,
    heading: "Question 2",
    status: "needs_answer",
    reasons: [{ code: "needs_answer", message: "The source marks no answer." }],
    sourceExcerpt: "For each finding, choose...",
    reviewHref: `/author/banks/b/ai-import/${BATCH}`,
    editor: {
      itemId: ENTRY,
      type: "matrix_multiple_choice",
      initialValues: matrixFormFromStored(keyless, ENTRY),
    },
    save: vi.fn(async () => ({ ok: true as const, version: 4, status: "ready" as const })),
    ...over,
  };
}

beforeEach(() => refresh.mockReset());

describe("AiImportEntryEditor", () => {
  it("shows the question's status, what to check and its source, with Save and no Publish", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AiImportEntryEditor {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Edit Question 2" })).toBeInTheDocument();
    expect(screen.getByText("Matrix Multiple Choice")).toBeInTheDocument();
    expect(screen.getByTestId("entry-status")).toHaveTextContent("Needs an answer");
    expect(
      within(screen.getByRole("list", { name: "What to check" })).getByText(
        "The source marks no answer.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Show the document's words"));
    expect(screen.getByText("For each finding, choose...")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to the review" })).toHaveAttribute(
      "href",
      `/author/banks/b/ai-import/${BATCH}`,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("saves the marked key at the shown version, then at the version it got back", async () => {
    const user = userEvent.setup({ delay: null });
    const save = vi
      .fn<AiImportEntryEditorProps["save"]>()
      .mockResolvedValueOnce({ ok: true, version: 4, status: "ready" })
      .mockResolvedValueOnce({ ok: true, version: 5, status: "ready" });
    render(<AiImportEntryEditor {...props({ save })} />);

    const radios = screen.getAllByRole("radio");
    await user.click(radios[0]!); // row 1: Expected
    await user.click(radios[3]!); // row 2: Unexpected
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved. This question is ready to import.",
    );
    expect(save).toHaveBeenCalledTimes(1);
    const [first] = save.mock.calls[0]!;
    expect(first).toMatchObject({ batchId: BATCH, entryId: ENTRY, version: 3 });
    const values = first.values as { rows: { correctColumnIds: string[] }[] };
    expect(values.rows.map((row) => row.correctColumnIds)).toEqual([["col_1"], ["col_2"]]);
    expect(refresh).toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Question stem" }), " Now.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toMatchObject({ version: 4 });
  });

  it("shows a refusal in the server's words", async () => {
    const user = userEvent.setup({ delay: null });
    const save = vi.fn(async () => ({
      ok: false as const,
      code: "not_complete",
      message: "This question is not complete yet.",
    }));
    render(<AiImportEntryEditor {...props({ save })} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This question is not complete yet.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says what still stands when a save leaves the question short of ready", async () => {
    const user = userEvent.setup({ delay: null });
    const save = vi.fn(async () => ({
      ok: true as const,
      version: 4,
      status: "needs_fix" as const,
    }));
    render(<AiImportEntryEditor {...props({ save })} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved. It still needs a fix.");
  });
});
