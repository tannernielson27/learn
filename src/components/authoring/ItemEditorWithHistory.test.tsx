import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { toItemRow } from "@/lib/supabase/itemRows";
import { editorFor, storedItemOf } from "./editorFor";
import { historyEntries } from "./historyEntries";
import { useItemEditorHost, useReportDirty } from "./ItemEditorHost";
import type { ItemEditorLoaderProps } from "./ItemEditorLoader";
import { ItemEditorWithHistory } from "./ItemEditorWithHistory";

// The real loader pulls in server actions; this stand-in shows what it was opened with and reports
// itself dirty whenever it opened on something other than the saved draft.
vi.mock("./ItemEditorLoader", () => ({
  ItemEditorLoader: function StubLoader(props: ItemEditorLoaderProps) {
    const host = useItemEditorHost();
    const values = props.initialValues as { correctOptionId: string };
    const saved = host.savedValues as { correctOptionId: string } | undefined;
    useReportDirty(saved !== undefined && saved.correctOptionId !== values.correctOptionId);
    return (
      <p>
        Editing with {values.correctOptionId}
        {saved ? `, saved ${saved.correctOptionId}` : ""}
      </p>
    );
  },
}));

const ITEM_ID = "3f0c9a52-8d4e-4f6b-9a41-6c2d7e8f9012";
const item = multipleChoiceItemSchema.parse({ ...FIXTURES.multiple_choice.canonical, id: ITEM_ID });
const row = {
  id: ITEM_ID,
  ...toItemRow({ ...item, version: 2, answerKey: { correctOptionId: "opt_b" } }),
};
const editor = editorFor(row.id, row.type, storedItemOf(row))!;
const entries = historyEntries(row, [
  {
    version: 2,
    created_at: "2026-09-19T10:00:00.000Z",
    snapshot: JSON.parse(JSON.stringify(storedItemOf(row))) as unknown,
  },
  {
    version: 1,
    created_at: "2026-09-18T10:00:00.000Z",
    snapshot: JSON.parse(JSON.stringify({ ...item, version: 1 })) as unknown,
  },
]);

async function restoreVersionOne(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "History" }));
  await user.click(screen.getByRole("button", { name: /^Version 1\b/ }));
  await user.click(screen.getByRole("button", { name: "Restore as draft" }));
}

describe("ItemEditorWithHistory", () => {
  it("opens the editor on the saved draft", () => {
    render(<ItemEditorWithHistory editor={editor} entries={entries} truncated={false} />);
    expect(screen.getByText("Editing with opt_b")).toBeInTheDocument();
  });

  it("restores a version into the editor as unsaved changes against the saved draft", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ItemEditorWithHistory editor={editor} entries={entries} truncated={false} />);
    await restoreVersionOne(user);

    expect(screen.getByText("Editing with opt_a, saved opt_b")).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(
      "Version 1 is loaded as unsaved changes. Save draft or publish to keep it; publishing adds a new version.",
    );
    expect(status).toHaveFocus();
  });

  it("says so when the restored version matches the saved draft", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ItemEditorWithHistory editor={editor} entries={entries} truncated={false} />);
    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: /^Version 2\b/ }));
    await user.click(screen.getByRole("button", { name: "Restore as draft" }));
    expect(screen.getByRole("status")).toHaveTextContent("Version 2 matches the saved draft.");
  });

  it("asks before a second restore replaces the unsaved first one", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ItemEditorWithHistory editor={editor} entries={entries} truncated={false} />);
    await restoreVersionOne(user);
    await restoreVersionOne(user);
    expect(
      screen.getByText("Your unsaved changes will be replaced by version 1."),
    ).toBeInTheDocument();
  });
});
