import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderersLoaded } from "@/components/question/testing/renderers";
import type { ReviewEntryView } from "@/lib/authoring/aiImportReview";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { AiImportReview, type AiImportReviewActions } from "./AiImportReview";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const requests = vi.hoisted(() => ({ postJson: vi.fn(), uploadToStorage: vi.fn() }));
vi.mock("./aiImportRequests", () => requests);

const BANK = "00000000-0000-4000-8000-0000000000d1";
const BATCH = "00000000-0000-4000-8000-0000000000b1";

/** The canonical multiple choice question with an empty key, as staging leaves an unmarked one. */
const unkeyed = { ...(FIXTURES.multiple_choice.canonical as Record<string, unknown>) };

const entry = (over: Partial<ReviewEntryView>): ReviewEntryView => ({
  id: "e",
  version: 1,
  position: 0,
  kind: "item",
  type: "multiple_choice",
  status: "ready",
  reasons: [],
  sourceExcerpt: "Source words.",
  item: null,
  group: null,
  ...over,
});

const ENTRIES: ReviewEntryView[] = [
  entry({ id: "ready", position: 0, item: FIXTURES.multiple_choice.canonical }),
  entry({
    id: "answer",
    position: 1,
    status: "needs_answer",
    item: { ...unkeyed, answerKey: { correctOptionId: "" } },
    reasons: [{ code: "needs_answer", message: "The source marks no answer." }],
  }),
  entry({
    id: "fix",
    position: 2,
    status: "needs_fix",
    reasons: [
      { code: "unmarked_key", message: "The AI marked an answer the document does not show." },
    ],
  }),
  entry({
    id: "open",
    position: 1000,
    type: null,
    status: "not_importable",
    reasons: [{ code: "not_ngn", message: "An open prompt." }],
    sourceExcerpt: "Discuss with a partner.",
  }),
  entry({
    id: "dup",
    position: 1001,
    item: FIXTURES.multiple_choice.canonical,
    reasons: [{ code: "duplicate", message: "The same as question 1 in Cardiac.md." }],
  }),
];

function actions(): AiImportReviewActions {
  return {
    drop: vi.fn(async (input) => ({
      ok: true as const,
      version: input.version + 1,
      status: "dropped" as const,
    })),
    restore: vi.fn(async (input) => ({
      ok: true as const,
      version: input.version + 1,
      status: "needs_fix" as const,
    })),
  };
}

function setup(entries = ENTRIES, act = actions()) {
  render(
    <AiImportReview
      bankId={BANK}
      quizName="Cardiac"
      batchId={BATCH}
      fileNames={["Cardiac.md", "Respiratory.docx"]}
      entries={entries}
      actions={act}
    />,
  );
  return { act, user: userEvent.setup() };
}

beforeEach(() => {
  refresh.mockReset();
  requests.postJson.mockReset();
});

describe("AiImportReview (#346)", () => {
  it("groups the questions by file, with every status and its reasons", async () => {
    setup();
    await renderersLoaded();
    const first = screen.getByRole("region", { name: "Cardiac.md" });
    const second = screen.getByRole("region", { name: "Respiratory.docx" });
    expect(within(first).getAllByRole("article")).toHaveLength(3);
    expect(within(second).getAllByRole("article")).toHaveLength(2);
    const statuses = screen.getAllByTestId("entry-status").map((node) => node.textContent);
    expect(statuses).toEqual([
      "Ready",
      "Needs an answer",
      "Needs a fix",
      "Not importable",
      "Ready",
    ]);
    expect(screen.getByText("The AI marked an answer the document does not show.")).toBeTruthy();
    // A ready question opens on its key, as the player shows it; nothing here can be submitted.
    const preview = screen.getByRole("region", { name: "Question 1, preview" });
    expect(within(preview).getByText("Missed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.getByText("No key yet. This is how students will see it.")).toBeTruthy();
  });

  it("blocks the import while a kept question needs an answer or a fix, and says why", () => {
    setup();
    const button = screen.getByTestId("import-button");
    expect(button.textContent).toBe("Import 4 questions");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button).toHaveAccessibleDescription(
      /1 question needs an answer.*1 question needs a fix/,
    );
  });

  it("filters by status and by duplicate, with counts", async () => {
    const { user } = setup();
    expect(screen.getByRole("button", { name: "Duplicate (1)" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Not importable (1)" }));
    expect(screen.getByRole("button", { name: "Not importable (1)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("An open prompt.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dropped (0)" }));
    expect(screen.getByText("No questions match this filter.")).toBeTruthy();
  });

  it("drops a question with the version it showed, and the import count follows", async () => {
    const { act, user } = setup();
    const fix = screen.getAllByRole("article")[2]!;
    await user.click(within(fix).getByRole("button", { name: "Drop" }));
    expect(act.drop).toHaveBeenCalledWith({ batchId: BATCH, entryId: "fix", version: 1 });
    await waitFor(() =>
      expect(screen.getByTestId("import-button").textContent).toBe("Import 3 questions"),
    );
    expect(within(fix).getByRole("status").textContent).toContain("Dropped.");
    expect(screen.getByRole("button", { name: "Dropped (1)" })).toBeTruthy();

    await user.click(within(fix).getByRole("button", { name: "Restore" }));
    expect(act.restore).toHaveBeenCalledWith({ batchId: BATCH, entryId: "fix", version: 2 });
    await waitFor(() =>
      expect(screen.getByTestId("import-button").textContent).toBe("Import 4 questions"),
    );
  });

  it("says when another tab changed the question first", async () => {
    const act = actions();
    act.drop = vi.fn(async () => ({
      ok: false as const,
      code: "entry_changed",
      message: "This question changed in another tab or window.",
    }));
    const { user } = setup(ENTRIES, act);
    const ready = screen.getAllByRole("article")[0]!;
    await user.click(within(ready).getByRole("button", { name: "Drop" }));
    expect(within(ready).getByRole("alert").textContent).toContain("changed in another tab");
    expect(screen.getByTestId("import-button").textContent).toBe("Import 4 questions");
  });

  it("enables the import only once nothing blocks it and the import is handed in", () => {
    const onImport = vi.fn();
    render(
      <AiImportReview
        bankId={BANK}
        quizName="Cardiac"
        batchId={BATCH}
        fileNames={["Cardiac.md"]}
        entries={[ENTRIES[0]!]}
        actions={actions()}
        onImport={onImport}
      />,
    );
    const button = screen.getByTestId("import-button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    expect(onImport).toHaveBeenCalled();
  });

  it("explains that importing is not available yet when nothing blocks it", () => {
    setup([ENTRIES[0]!]);
    expect((screen.getByTestId("import-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Importing is not available yet/)).toBeTruthy();
  });

  it("shows the source on a toggle", async () => {
    const { user } = setup();
    const open = screen.getAllByRole("article")[3]!;
    const toggle = within(open).getByRole("button", { name: "Show source" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(within(open).getByRole("button", { name: "Hide source" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(open).getByRole("region", { name: "Question 4, source" }).textContent).toContain(
      "Discuss with a partner.",
    );
  });

  it("changes the type by reading the question again, says it costs, and reloads", async () => {
    requests.postJson.mockResolvedValue({ ok: true, version: 2, status: "needs_answer" });
    const { user } = setup();
    const fix = screen.getAllByRole("article")[2]!;
    expect(within(fix).getByText(/counts towards this month's AI import allowance/)).toBeTruthy();
    const select = within(fix).getByRole("combobox", { name: "Change type" });
    expect(within(select).queryByRole("option", { name: "Multiple Choice" })).toBeNull();
    await user.selectOptions(select, "bowtie");
    await user.click(within(fix).getByRole("button", { name: "Read again as this type" }));
    expect(requests.postJson).toHaveBeenCalledWith("/api/ai-import/retype", {
      batchId: BATCH,
      entryId: "fix",
      version: 1,
      type: "bowtie",
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(within(fix).getByRole("status").textContent).toBe("Read again as Bowtie.");
  });

  it("names a failed change of type", async () => {
    requests.postJson.mockResolvedValue({
      ok: false,
      code: "cap_reached",
      message: "Your workspace has reached this month's AI import allowance.",
    });
    const { user } = setup();
    const fix = screen.getAllByRole("article")[2]!;
    await user.selectOptions(within(fix).getByRole("combobox", { name: "Change type" }), "bowtie");
    await user.click(within(fix).getByRole("button", { name: "Read again as this type" }));
    expect((await within(fix).findByRole("alert")).textContent).toContain("allowance");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers no change of type for a case study, and says when its steps cannot be shown", () => {
    setup([
      entry({
        id: "case",
        kind: "case_study",
        type: null,
        status: "needs_answer",
        item: { title: "Ectopic" },
        group: { title: "Ectopic pregnancy", step: null },
      }),
    ]);
    expect(screen.getByRole("heading", { name: "Case study: Ectopic pregnancy" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Change type" })).toBeNull();
    expect(screen.getByText(/cannot be shown step by step yet/)).toBeTruthy();
    expect(screen.getByTestId("import-button").textContent).toBe("Import 1 case study");
  });
});
