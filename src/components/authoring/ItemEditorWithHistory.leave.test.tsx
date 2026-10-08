import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { toItemRow } from "@/lib/supabase/itemRows";
import { DuplicateButton, type DuplicateButtonProps } from "./DuplicateButton";
import { editorFor, storedItemOf } from "./editorFor";
import { historyEntries } from "./historyEntries";
import { useItemEditorHost, useReportDirty } from "./ItemEditorHost";
import type { ItemEditorLoaderProps } from "./ItemEditorLoader";
import { ItemEditorWithHistory } from "./ItemEditorWithHistory";
import { GuardedLink, LeaveGuardProvider } from "./LeaveGuard";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/author/items/3f0c9a52-8d4e-4f6b-9a41-6c2d7e8f9012",
}));

// The real loader pulls in server actions. This one is dirty whenever it opened on a restored
// version, which is the simplest way to hold unsaved changes here.
vi.mock("./ItemEditorLoader", () => ({
  ItemEditorLoader: function StubLoader(props: ItemEditorLoaderProps) {
    const host = useItemEditorHost();
    const values = props.initialValues as { correctOptionId: string };
    const saved = host.savedValues as { correctOptionId: string } | undefined;
    useReportDirty(saved !== undefined && saved.correctOptionId !== values.correctOptionId);
    return <p>Editing with {values.correctOptionId}</p>;
  },
}));

const ITEM_ID = "3f0c9a52-8d4e-4f6b-9a41-6c2d7e8f9012";
const BANK_HREF = "/author/banks/9b1d2c3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e";
const item = multipleChoiceItemSchema.parse({ ...FIXTURES.multiple_choice.canonical, id: ITEM_ID });
const row = {
  id: ITEM_ID,
  ...toItemRow({ ...item, version: 2, answerKey: { correctOptionId: "opt_b" } }),
};
const editor = editorFor(row.id, row.type, storedItemOf(row))!;
const entries = historyEntries(row, [
  {
    version: 1,
    created_at: "2026-09-18T10:00:00.000Z",
    snapshot: JSON.parse(JSON.stringify({ ...item, version: 1 })) as unknown,
  },
]);

function setup() {
  push.mockClear();
  const duplicate = vi.fn<DuplicateButtonProps["action"]>(async () => ({ status: "idle" }));
  render(
    <LeaveGuardProvider>
      <GuardedLink href={BANK_HREF}>Back to bank</GuardedLink>
      <DuplicateButton action={duplicate} label="Duplicate item" />
      <ItemEditorWithHistory editor={editor} entries={entries} truncated={false} />
    </LeaveGuardProvider>,
  );
  return { duplicate, user: userEvent.setup({ delay: null }) };
}

async function makeUnsavedChanges(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "History" }));
  await user.click(screen.getByRole("button", { name: /^Version 1\b/ }));
  await user.click(screen.getByRole("button", { name: "Restore as draft" }));
}

describe("leaving a standalone item with unsaved changes", () => {
  it("leaves at once when nothing is unsaved", () => {
    setup();
    expect(fireEvent.click(screen.getByRole("link", { name: "Back to bank" }))).toBe(true);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks first, and focuses the question so it is seen", async () => {
    const { user } = setup();
    await makeUnsavedChanges(user);
    expect(fireEvent.click(screen.getByRole("link", { name: "Back to bank" }))).toBe(false);

    const ask = screen.getByRole("alertdialog", { name: "This item has unsaved changes" });
    expect(ask).toHaveTextContent("Stay to save them, or discard them and leave this item.");
    expect(ask).toHaveFocus();
  });

  it("goes where the link pointed once the author discards", async () => {
    const { user } = setup();
    await makeUnsavedChanges(user);
    fireEvent.click(screen.getByRole("link", { name: "Back to bank" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(push).toHaveBeenCalledWith(BANK_HREF);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("stays, with the changes kept, when the author chooses to", async () => {
    const { user } = setup();
    await makeUnsavedChanges(user);
    fireEvent.click(screen.getByRole("link", { name: "Back to bank" }));
    await user.click(screen.getByRole("button", { name: "Stay on this item" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Editing with opt_a")).toBeInTheDocument();
  });

  it("asks before Duplicate copies the saved version, and copies it once discarded", async () => {
    const { duplicate, user } = setup();
    await makeUnsavedChanges(user);
    await user.click(screen.getByRole("button", { name: "Duplicate item" }));
    expect(duplicate).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });
});
