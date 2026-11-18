import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { backLinkClasses } from "@/components/ui/BackLink";
import { matrixFormFromStored } from "@/lib/authoring/forms/matrix";
import { fromMatrixMultipleChoiceDraft } from "@/lib/ngn/draft";
import { AiImportEntryEditor, type AiImportEntryEditorProps } from "./AiImportEntryEditor";
import { Breadcrumbs } from "./FolderBreadcrumbs";
import { LeaveGuardProvider } from "./LeaveGuard";
import type { ItemEditorSwitchProps } from "./ItemEditorSwitch";
import { MatrixEditor } from "./MatrixEditor";

const refresh = vi.fn();
const push = vi.fn();
// One router object, as the real hook gives: the editor's host is rebuilt when it changes.
const router = { refresh, push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

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

beforeEach(() => {
  refresh.mockReset();
  push.mockReset();
});

describe("AiImportEntryEditor", () => {
  it("shows the question's status, what to check and its source, with Save and no Publish", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AiImportEntryEditor {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Edit Question 2" })).toBeInTheDocument();
    expect(screen.getByText("Matrix multiple choice")).toBeInTheDocument();
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
    // #563: the one back-link look, with its chevron, on the guarded link.
    const back = screen.getByRole("link", { name: "Back to the review" });
    expect(back).toHaveClass(...backLinkClasses().split(" "));
    expect(back.querySelector("svg")).not.toBeNull();
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

describe("AiImportEntryEditor: fixing several in a row (#593)", () => {
  const NEXT = `/author/banks/b/ai-import/${BATCH}/next-entry?show=needs_answer`;
  const BACK = `/author/banks/b/ai-import/${BATCH}?show=needs_answer#entry-${ENTRY}`;

  async function mark(user: ReturnType<typeof userEvent.setup>) {
    const radios = screen.getAllByRole("radio");
    await user.click(radios[0]!);
    await user.click(radios[3]!);
  }

  it("saves, then goes to the next question that needs attention", async () => {
    const user = userEvent.setup({ delay: null });
    const save = vi
      .fn<AiImportEntryEditorProps["save"]>()
      .mockResolvedValue({ ok: true, version: 4, status: "ready" });
    render(<AiImportEntryEditor {...props({ save, nextHref: NEXT, reviewHref: BACK })} />);
    await mark(user);
    await user.click(screen.getByRole("button", { name: "Save and go to the next one" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(NEXT));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0]).toMatchObject({ entryId: ENTRY, version: 3 });
  });

  it("stays, with the reason, when the save is refused", async () => {
    const user = userEvent.setup({ delay: null });
    const save = vi.fn(async () => ({
      ok: false as const,
      code: "not_complete",
      message: "This question is not complete yet.",
    }));
    render(<AiImportEntryEditor {...props({ save, nextHref: NEXT })} />);
    await user.click(screen.getByRole("button", { name: "Save and go to the next one" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This question is not complete yet.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("goes back to the review, at this question's card, when nothing else needs attention", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AiImportEntryEditor {...props({ reviewHref: BACK })} />);
    expect(screen.queryByRole("button", { name: "Save and go to the next one" })).toBeNull();
    await mark(user);
    await user.click(screen.getByRole("button", { name: "Save and go back to the review" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(BACK));
    expect(screen.getByRole("link", { name: "Back to the review" })).toHaveAttribute("href", BACK);
  });

  it("saves a case study's step by its number, and says where the case study stands", async () => {
    const user = userEvent.setup({ delay: null });
    const save = vi
      .fn<AiImportEntryEditorProps["save"]>()
      .mockResolvedValue({ ok: true, version: 4, status: "needs_answer" });
    render(
      <AiImportEntryEditor
        {...props({
          save,
          heading: "step 4 of 6 in Pulmonary embolism",
          caseStep: { step: 4, record: null },
        })}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Edit step 4 of 6 in Pulmonary embolism" }),
    ).toBeInTheDocument();
    await mark(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved. Another step still needs its key.",
    );
    expect(save.mock.calls[0]![0]).toMatchObject({ entryId: ENTRY, version: 3, step: 4 });
  });

  it("shows the document's marks, and a PDF's pages, with the question's source", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <AiImportEntryEditor
        {...props({
          sourceExcerpt: "**Marked in bold**: weight loss",
          sourcePages: { from: 2, to: 2 },
          fileName: "Malnutrition.pdf",
        })}
      />,
    );
    await user.click(screen.getByText("Show the document's words"));
    expect(screen.getByText("Marked in bold").tagName).toBe("STRONG");
    expect(screen.getByTestId("source-pages")).toHaveTextContent(
      "Opening words only. This question was read from page 2 of Malnutrition.pdf.",
    );
  });

  it("asks before a breadcrumb leaves a changed form", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <LeaveGuardProvider>
        <Breadcrumbs
          guarded
          crumbs={[
            { label: "Cardiac", href: "/author/banks/b" },
            { label: "Review AI import", href: BACK },
          ]}
        />
        <AiImportEntryEditor {...props({ reviewHref: BACK })} />
      </LeaveGuardProvider>,
    );
    await mark(user);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(screen.getByRole("link", { name: "Cardiac" }));
    const ask = screen.getByRole("alertdialog", { name: "This question has unsaved changes" });
    // Staying keeps the form; discarding goes where the crumb led.
    await user.click(within(ask).getByRole("button", { name: "Discard changes" }));
    expect(push).toHaveBeenCalledWith("/author/banks/b");
  });
});
