import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toEhrForm } from "@/lib/authoring/forms/ehr";
import { toMatrixForm } from "@/lib/authoring/forms/matrix";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { sampleEhr } from "@/lib/ngn/fixtures/case-study";
import { matrixMultipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { EhrEditor } from "./EhrEditor";
import { ItemEditorHostContext } from "./ItemEditorHost";
import { MatrixEditor } from "./MatrixEditor";

const matrix = () =>
  toMatrixForm(matrixMultipleChoiceItemSchema.parse(FIXTURES.matrix_multiple_choice.canonical));

function renderInCaseStudy(onDirtyChange = vi.fn<(dirty: boolean) => void>()) {
  render(
    <ItemEditorHostContext.Provider value={{ inCaseStudy: true, record: sampleEhr, onDirtyChange }}>
      <MatrixEditor
        type="matrix_multiple_choice"
        initialValues={matrix()}
        onSaveDraft={vi.fn(async () => ({ ok: true }))}
        onPublish={vi.fn(async () => ({ ok: true }))}
      />
    </ItemEditorHostContext.Provider>,
  );
  return { onDirtyChange, user: userEvent.setup({ delay: null }) };
}

describe("an item editor inside a case study", () => {
  it("offers no record of its own, since the case study owns the record", () => {
    renderInCaseStudy();
    expect(screen.queryByRole("button", { name: "Add patient record" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Patient record" })).not.toBeInTheDocument();
  });

  it("heads its problems one level below the step's own heading", () => {
    render(
      <ItemEditorHostContext.Provider value={{ inCaseStudy: true }}>
        <MatrixEditor
          type="matrix_multiple_choice"
          initialValues={{ ...matrix(), stem: "" }}
          onSaveDraft={vi.fn(async () => ({ ok: true }))}
          onPublish={vi.fn(async () => ({ ok: true }))}
        />
      </ItemEditorHostContext.Provider>,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Before this item can be published" }),
    ).toBeInTheDocument();
  });

  it("previews the question with the case study's record", () => {
    renderInCaseStudy();
    const preview = within(screen.getByRole("region", { name: "Preview" }));
    expect(preview.getByRole("heading", { name: "74-year-old female" })).toBeInTheDocument();
  });

  it("tells the case study when it has unsaved changes", async () => {
    const { onDirtyChange, user } = renderInCaseStudy();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.type(screen.getByRole("textbox", { name: "Question stem" }), " More.");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});

describe("the record editor inside a case study", () => {
  it("tells the case study when it has unsaved changes", async () => {
    const onDirtyChange = vi.fn<(dirty: boolean) => void>();
    render(
      <ItemEditorHostContext.Provider value={{ inCaseStudy: true, onDirtyChange }}>
        <EhrEditor
          initialValues={toEhrForm(sampleEhr)}
          onSave={vi.fn(async () => ({ ok: true }))}
        />
      </ItemEditorHostContext.Provider>,
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await userEvent.setup({ delay: null }).type(screen.getByLabelText("Care setting"), " B");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  }, 30_000);
});
