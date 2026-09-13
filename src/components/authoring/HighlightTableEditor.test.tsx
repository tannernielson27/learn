import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyHighlightTableForm,
  toHighlightTableForm,
  type HighlightTableFormValues,
} from "@/lib/authoring/forms/highlight";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { highlightTableItemSchema } from "@/lib/ngn/schemas";
import { HighlightTableEditor } from "./HighlightTableEditor";

function setup(initialValues: HighlightTableFormValues = emptyHighlightTableForm("htb_new")) {
  const onSaveDraft = vi.fn<(values: HighlightTableFormValues) => Promise<{ ok: boolean }>>(
    async () => ({ ok: true }),
  );
  const onPublish = vi.fn<(item: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
  render(
    <HighlightTableEditor
      initialValues={initialValues}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
    />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

const canonical = () =>
  toHighlightTableForm(highlightTableItemSchema.parse(FIXTURES.highlight_table.canonical));
const cell = (row: number, column: number) =>
  screen.getByRole("textbox", { name: `Row ${row}, column ${column}` }) as HTMLTextAreaElement;

describe("HighlightTableEditor", () => {
  it("offers column headings, a cell per row and column, and per-row scoring", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Column 1" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Column 2" })).toBeInTheDocument();
    const row = screen.getByRole("group", { name: "Row 1" });
    expect(within(row).getByRole("textbox", { name: "Row 1, column 2" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Score each row separately" })).not.toBeChecked();
  });

  it("marks a phrase in a cell as a span", async () => {
    const { user } = setup();
    await user.click(cell(1, 2));
    await user.paste("Dry lips; no rash");
    cell(1, 2).setSelectionRange(0, 8);
    await user.click(screen.getByRole("button", { name: "Mark span in row 1, column 2" }));
    expect(cell(1, 2)).toHaveValue("[[Dry lips|span_1]]; no rash");
    expect(screen.getByRole("checkbox", { name: "Dry lips is correct" })).toBeInTheDocument();
    // The player renders the table and the phone row cards together, so the phrase appears twice.
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(within(preview).getAllByRole("button", { name: "Dry lips" }).length).toBeGreaterThan(0);
  });

  it("adds and removes a column, keeping every row in step", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getByRole("textbox", { name: "Column 3" })).toBeInTheDocument();
    expect(cell(2, 3)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove column 3" }));
    expect(screen.queryByRole("textbox", { name: "Column 3" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Row 2, column 3" })).not.toBeInTheDocument();
  });

  it("removing a column clears the answers for spans inside it", async () => {
    const { onSaveDraft, user } = setup(canonical());
    await user.click(screen.getByRole("button", { name: "Add column" }));
    await user.click(cell(1, 3));
    await user.paste("[[pale|p1]]");
    await user.click(screen.getByRole("checkbox", { name: "pale is correct" }));
    await user.click(screen.getByRole("button", { name: "Remove column 3" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft.mock.calls[0][0].correctSpanIds).toEqual(["g1", "s1", "s2", "r1"]);
  });

  it("publishes the fixture table unchanged", async () => {
    const { onPublish, user } = setup(canonical());
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(highlightTableItemSchema.parse(onPublish.mock.calls[0][0])).toEqual(
      highlightTableItemSchema.parse(FIXTURES.highlight_table.canonical),
    );
  });
});
