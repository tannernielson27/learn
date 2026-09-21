import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyMatrixForm, toMatrixForm } from "@/lib/authoring/forms/matrix";
import { FIXTURES } from "@/lib/ngn/fixtures";
import {
  matrixMultipleChoiceItemSchema,
  matrixMultipleResponseItemSchema,
} from "@/lib/ngn/schemas";
import { MatrixEditor } from "./MatrixEditor";
import { renderersLoaded } from "@/components/question/testing/renderers";

function setup(
  type: "matrix_multiple_choice" | "matrix_multiple_response",
  initialValues = emptyMatrixForm("mx_new"),
) {
  const onSaveDraft = vi.fn<(values: unknown) => Promise<{ ok: boolean }>>(async () => ({
    ok: true,
  }));
  // The editor publishes either matrix type, so the mock accepts anything; tests narrow on read.
  const onPublish = vi.fn<(item: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
  render(
    <MatrixEditor
      type={type}
      initialValues={initialValues}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
    />,
  );
  return { onSaveDraft, onPublish, user: userEvent.setup() };
}

describe("MatrixEditor", () => {
  it("offers a heading for each column and text for each row", () => {
    setup("matrix_multiple_choice");
    expect(screen.getByRole("textbox", { name: "Column 1" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Column 2" })).toBeInTheDocument();
    for (const row of [1, 2]) {
      const fieldset = screen.getByRole("group", { name: `Row ${row}` });
      expect(within(fieldset).getByRole("textbox", { name: "Row text" })).toBeInTheDocument();
    }
  });

  it("marks one column per row with radios for matrix multiple choice", async () => {
    const { user } = setup("matrix_multiple_choice");
    await user.type(screen.getByRole("textbox", { name: "Column 1" }), "Indicated");
    await user.type(screen.getByRole("textbox", { name: "Column 2" }), "Contraindicated");
    const answers = screen.getByRole("radiogroup", { name: "Correct column for row 1" });
    await user.click(within(answers).getByRole("radio", { name: "Indicated" }));
    await user.click(within(answers).getByRole("radio", { name: "Contraindicated" }));
    expect(within(answers).getByRole("radio", { name: "Contraindicated" })).toBeChecked();
    expect(within(answers).getByRole("radio", { name: "Indicated" })).not.toBeChecked();
  });

  it("marks any columns per row with checkboxes for matrix multiple response", async () => {
    const { user } = setup("matrix_multiple_response");
    await user.type(screen.getByRole("textbox", { name: "Column 1" }), "INR");
    await user.type(screen.getByRole("textbox", { name: "Column 2" }), "Daily weight");
    const answers = screen.getByRole("group", { name: "Correct columns for row 1" });
    await user.click(within(answers).getByRole("checkbox", { name: "INR" }));
    await user.click(within(answers).getByRole("checkbox", { name: "Daily weight" }));
    expect(within(answers).getByRole("checkbox", { name: "INR" })).toBeChecked();
    expect(within(answers).getByRole("checkbox", { name: "Daily weight" })).toBeChecked();
  });

  it("clears a removed column from every row's answer", async () => {
    const valid = toMatrixForm(
      matrixMultipleResponseItemSchema.parse(FIXTURES.matrix_multiple_response.edge),
    );
    const { user, onPublish } = setup("matrix_multiple_response", valid);
    // Edge fixture: Warfarin is INR + bleeding, furosemide is potassium + daily weight.
    await user.click(screen.getByRole("button", { name: "Remove column 1" }));
    await user.click(screen.getByRole("button", { name: "Publish" }));
    const published = onPublish.mock.calls[0]?.[0] as
      { answerKey: { rows: { correctColumnIds: string[] }[] } } | undefined;
    expect(published).toBeDefined();
    for (const row of published!.answerKey.rows) {
      expect(row.correctColumnIds).not.toContain("c1");
    }
  });

  it("previews the grid with the same player, as it is typed", async () => {
    const { user } = setup("matrix_multiple_choice");
    await renderersLoaded();
    const preview = screen.getByRole("region", { name: "Preview" });
    await user.type(
      within(screen.getByRole("group", { name: "Row 1" })).getByRole("textbox", {
        name: "Row text",
      }),
      "Keep the client NPO",
    );
    await user.type(screen.getByRole("textbox", { name: "Column 1" }), "Indicated");
    expect(within(preview).getAllByText("Keep the client NPO").length).toBeGreaterThan(0);
    expect(within(preview).getAllByText("Indicated").length).toBeGreaterThan(0);
  });

  it("publishes a complete matrix multiple choice item as schema-valid input", async () => {
    const valid = toMatrixForm(
      matrixMultipleChoiceItemSchema.parse(FIXTURES.matrix_multiple_choice.canonical),
    );
    const { user, onPublish } = setup("matrix_multiple_choice", valid);
    expect(screen.queryByRole("region", { name: "Problems to fix" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(matrixMultipleChoiceItemSchema.safeParse(onPublish.mock.calls[0][0]).success).toBe(true);
  });
});
