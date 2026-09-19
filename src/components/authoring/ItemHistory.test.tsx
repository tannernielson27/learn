import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { toItemRow } from "@/lib/supabase/itemRows";
import { historyEntries, type HistoryEntry } from "./historyEntries";
import { ItemHistory } from "./ItemHistory";

const ITEM_ID = "3f0c9a52-8d4e-4f6b-9a41-6c2d7e8f9012";
const item = multipleChoiceItemSchema.parse({ ...FIXTURES.multiple_choice.canonical, id: ITEM_ID });
const row = {
  id: ITEM_ID,
  ...toItemRow({ ...item, version: 2, answerKey: { correctOptionId: "opt_b" } }),
};
const snapshot = (version: number, correctOptionId: string, stem = item.stem.value) =>
  JSON.parse(
    JSON.stringify({
      ...item,
      version,
      stem: { kind: "markdown", value: stem },
      answerKey: { correctOptionId },
    }),
  ) as unknown;

const entries = (): HistoryEntry[] =>
  historyEntries(row, [
    { version: 2, created_at: "2026-09-19T10:00:00.000Z", snapshot: snapshot(2, "opt_b") },
    {
      version: 1,
      created_at: "2026-09-18T10:00:00.000Z",
      snapshot: snapshot(1, "opt_a", "The first stem"),
    },
  ]);

function renderHistory(props: Partial<Parameters<typeof ItemHistory>[0]> = {}) {
  const onRestore = vi.fn();
  render(
    <ItemHistory
      entries={entries()}
      truncated={false}
      dirty={false}
      onRestore={onRestore}
      {...props}
    />,
  );
  return { onRestore, user: userEvent.setup({ delay: null }) };
}

async function openVersion(user: ReturnType<typeof userEvent.setup>, version: number) {
  await user.click(screen.getByRole("button", { name: "History", expanded: false }));
  await user.click(screen.getByRole("button", { name: new RegExp(`^Version ${version}\\b`) }));
}

describe("ItemHistory", () => {
  it("starts closed and lists the published versions newest first when opened", async () => {
    const { user } = renderHistory();
    expect(screen.queryByRole("list", { name: "Published versions" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "History" }));
    const list = screen.getByRole("list", { name: "Published versions" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Version 2 Published Sep 19, 2026", "Version 1 Published Sep 18, 2026"]);
  });

  it("says when nothing has been published", async () => {
    const { user } = renderHistory({ entries: [] });
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(
      screen.getByText("Nothing published yet. Each publish adds a version here."),
    ).toBeInTheDocument();
  });

  it("previews a version read-only with what changed since", async () => {
    const { user } = renderHistory();
    await openVersion(user, 1);

    expect(screen.getByRole("button", { name: /^Version 1\b/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const panel = screen.getByRole("region", { name: "Version 1" });
    const changes = within(panel).getByRole("list", { name: "Compared with the saved draft" });
    expect(
      within(changes)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["The stem changed.", "The answer key changed."]);
    const preview = within(panel).getByRole("region", { name: "Version 1 preview" });
    expect(within(preview).getByText("The first stem")).toBeInTheDocument();
    // Read-only: nothing to answer and nothing to submit.
    for (const radio of within(preview).getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(within(preview).queryByRole("button", { name: /submit/i })).not.toBeInTheDocument();
  });

  it("says when a version matches the draft", async () => {
    const { user } = renderHistory();
    await openVersion(user, 2);
    expect(
      within(screen.getByRole("region", { name: "Version 2" })).getByText(
        "Same as the saved draft.",
      ),
    ).toBeInTheDocument();
  });

  it("restores a version straight away when nothing is unsaved, and closes", async () => {
    const { user, onRestore } = renderHistory();
    await openVersion(user, 1);
    await user.click(screen.getByRole("button", { name: "Restore as draft" }));

    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ version: 1, ok: true }));
    expect(screen.getByRole("button", { name: "History" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("asks before replacing unsaved changes", async () => {
    const { user, onRestore } = renderHistory({ dirty: true });
    await openVersion(user, 1);
    await user.click(screen.getByRole("button", { name: "Restore as draft" }));

    expect(onRestore).not.toHaveBeenCalled();
    expect(
      screen.getByText("Your unsaved changes will be replaced by version 1."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("button", { name: "Restore as draft" })).toHaveFocus();
    expect(onRestore).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Restore as draft" }));
    await user.click(screen.getByRole("button", { name: "Replace my changes" }));
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  });

  it("opens a version that no longer validates read-only, with the reason and no restore", async () => {
    const broken = { ...(snapshot(1, "opt_a") as object), content: { options: [] } };
    const { user } = renderHistory({
      entries: historyEntries(row, [
        { version: 1, created_at: "2026-09-18T10:00:00.000Z", snapshot: broken },
      ]),
    });
    await openVersion(user, 1);

    const panel = screen.getByRole("region", { name: "Version 1" });
    expect(
      within(panel).getByText(
        "This version no longer matches the current question format, so it can be read here but not restored.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Restore as draft" })).toBeNull();
  });

  it("says when the history could not be loaded, instead of claiming there is none", async () => {
    const { user } = renderHistory({ entries: [], loadFailed: true });
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(
      screen.getByText("The history could not be loaded. Reload the page to try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing published yet/)).not.toBeInTheDocument();
  });

  it("says when older versions are not listed", async () => {
    const { user } = renderHistory({ truncated: true });
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("Showing the latest 50 versions.")).toBeInTheDocument();
  });
});
