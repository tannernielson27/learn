import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyEhrForm } from "@/lib/authoring/forms/ehr";
import { emptyMatrixForm, toMatrixForm, type MatrixFormValues } from "@/lib/authoring/forms/matrix";
import { sampleTrendEhr, sampleTrendItem } from "@/lib/ngn/fixtures/trend";
import { matrixMultipleChoiceItemSchema } from "@/lib/ngn/schemas";
import type { SaveResult } from "./EditorShell";
import { MatrixEditor } from "./MatrixEditor";

function setup(initialValues: MatrixFormValues) {
  const onSaveDraft = vi.fn<(values: MatrixFormValues) => Promise<SaveResult>>(async () => ({
    ok: true,
  }));
  render(
    <MatrixEditor
      type="matrix_multiple_choice"
      initialValues={initialValues}
      onSaveDraft={onSaveDraft}
      onPublish={vi.fn(async () => ({ ok: true }))}
    />,
  );
  return { onSaveDraft, user: userEvent.setup({ delay: null }) };
}

// The Trend item with only its first four sections, which is plenty here and renders quickly.
const trend = (): MatrixFormValues =>
  toMatrixForm(
    matrixMultipleChoiceItemSchema.parse({
      ...sampleTrendItem,
      ehr: { ...sampleTrendEhr, tabs: sampleTrendEhr.tabs.slice(0, 4) },
    }),
  );

const button = (name: string) => {
  const found = Array.from(document.querySelectorAll("button")).filter(
    (element) => element.textContent?.replace(/\s+/g, " ").trim() === name,
  );
  if (found.length !== 1) throw new Error(`Expected one "${name}" button, found ${found.length}`);
  return found[0]!;
};
const preview = () => screen.getByLabelText("Preview");

describe("a patient record in an item editor", () => {
  it("previews the item's record beside the question, with its time selector", async () => {
    const { user } = setup(trend());
    const record = within(preview());
    expect(record.getByRole("radio", { name: "0800" })).toBeChecked();
    await user.click(record.getByRole("radio", { name: "1600" }));
    expect(record.getByRole("radio", { name: "1600" })).toBeChecked();
    // The matrix player renders a grid and phone row cards together, so the row reads twice.
    expect(record.getAllByText("Peripheral perfusion").length).toBeGreaterThan(0);
  }, 30_000);

  it("adds a record to an item that has none, and saves it with the draft", async () => {
    const { onSaveDraft, user } = setup(emptyMatrixForm("mx_new"));
    expect(screen.queryByLabelText("Age in years")).not.toBeInTheDocument();
    await user.click(button("Add patient record"));
    expect(screen.getByLabelText("Age in years")).toBeInTheDocument();
    expect(screen.getByText(/never enter real patient information/i)).toBeInTheDocument();
    // Inside an item, the record's sections sit under its own heading.
    expect(screen.getByRole("heading", { level: 2, name: "Patient record" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Sections" })).toBeInTheDocument();

    await user.click(button("Save draft"));
    expect(onSaveDraft.mock.calls[0]![0].ehr).toStrictEqual(emptyEhrForm());
  }, 30_000);

  it("asks before removing the record, and keeps it when the author says so", async () => {
    const { onSaveDraft, user } = setup(trend());
    await user.click(button("Remove patient record"));
    expect(screen.getByText("Remove the patient record from this item?")).toBeInTheDocument();
    await user.click(button("Keep record"));
    expect(screen.getByLabelText("Age in years")).toBeInTheDocument();

    await user.click(button("Remove patient record"));
    await user.click(button("Remove record"));
    expect(screen.queryByLabelText("Age in years")).not.toBeInTheDocument();
    expect(button("Add patient record")).toHaveFocus();
    await user.click(button("Save draft"));
    expect(onSaveDraft.mock.calls[0]![0].ehr).toBeUndefined();
  }, 30_000);

  it("lists record problems with the item's, and a problem takes the author to its field", async () => {
    const { user } = setup(trend());
    await user.click(button("Remove patient record"));
    await user.click(button("Remove record"));
    await user.click(button("Add patient record"));

    const problems = within(screen.getByLabelText("Problems to fix"));
    await user.click(problems.getByRole("button", { name: "Choose the patient's sex." }));
    expect(screen.getByLabelText("Sex", { selector: "select" })).toHaveFocus();
    expect(button("Publish")).toHaveAttribute("aria-disabled", "true");
  }, 30_000);
});
