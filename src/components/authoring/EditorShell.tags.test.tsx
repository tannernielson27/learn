import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { emptyBowtieForm } from "@/lib/authoring/forms/bowtie";
import { emptyClozeForm } from "@/lib/authoring/forms/cloze";
import { emptyDragDropForm } from "@/lib/authoring/forms/dragdrop";
import { emptyDropdownTableForm } from "@/lib/authoring/forms/dropdownTable";
import { emptyHighlightTableForm, emptyHighlightTextForm } from "@/lib/authoring/forms/highlight";
import { emptyMatrixForm } from "@/lib/authoring/forms/matrix";
import {
  emptyMultipleChoiceForm,
  type MultipleChoiceFormValues,
} from "@/lib/authoring/forms/multipleChoice";
import { emptyMultipleResponseForm } from "@/lib/authoring/forms/multipleResponse";
import { emptyGroupingForm } from "@/lib/authoring/forms/multipleResponseGrouping";
import { emptyOrderedResponseForm } from "@/lib/authoring/forms/orderedResponse";
import { BowtieEditor } from "./BowtieEditor";
import { ClozeEditor } from "./ClozeEditor";
import { DragDropEditor } from "./DragDropEditor";
import { DropdownTableEditor } from "./DropdownTableEditor";
import type { SaveResult } from "./EditorShell";
import { GroupingEditor } from "./GroupingEditor";
import { HighlightTableEditor } from "./HighlightTableEditor";
import { HighlightTextEditor } from "./HighlightTextEditor";
import { ItemEditorHostContext } from "./ItemEditorHost";
import { MatrixEditor } from "./MatrixEditor";
import { MultipleChoiceEditor } from "./MultipleChoiceEditor";
import { MultipleResponseEditor } from "./MultipleResponseEditor";
import { OrderedResponseEditor } from "./OrderedResponseEditor";

const ID = "item_new";
const save = () => vi.fn(async () => ({ ok: true }));

const editors: [string, () => ReactElement][] = [
  [
    "multiple choice",
    () => (
      <MultipleChoiceEditor
        initialValues={emptyMultipleChoiceForm(ID)}
        onSaveDraft={save()}
        onPublish={save()}
      />
    ),
  ],
  [
    "multiple response",
    () => (
      <MultipleResponseEditor
        initialValues={emptyMultipleResponseForm(ID)}
        onSaveDraft={save()}
        onPublish={save()}
      />
    ),
  ],
  [
    "grouping",
    () => (
      <GroupingEditor
        initialValues={emptyGroupingForm(ID)}
        onSaveDraft={save()}
        onPublish={save()}
      />
    ),
  ],
  [
    "matrix",
    () => (
      <MatrixEditor
        type="matrix_multiple_choice"
        initialValues={emptyMatrixForm(ID)}
        onSaveDraft={save()}
        onPublish={save()}
      />
    ),
  ],
  [
    "dropdown table",
    () => (
      <DropdownTableEditor
        initialValues={emptyDropdownTableForm(ID)}
        onSaveDraft={save()}
        onPublish={save()}
      />
    ),
  ],
  [
    "cloze",
    () => (
      <ClozeEditor
        type="dropdown_cloze"
        initialValues={emptyClozeForm(ID)}
        onSaveDraft={save()}
        onPublish={save()}
      />
    ),
  ],
  [
    "highlight text",
    () => (
      <HighlightTextEditor
        initialValues={emptyHighlightTextForm(ID)}
        onSaveDraft={save()}
        onPublish={save()}
      />
    ),
  ],
  [
    "highlight table",
    () => (
      <HighlightTableEditor
        initialValues={emptyHighlightTableForm(ID)}
        onSaveDraft={save()}
        onPublish={save()}
      />
    ),
  ],
  [
    "drag and drop",
    () => (
      <DragDropEditor
        type="dragdrop_cloze"
        initialValues={emptyDragDropForm(ID)}
        onSaveDraft={save()}
        onPublish={save()}
      />
    ),
  ],
  [
    "ordered response",
    () => (
      <OrderedResponseEditor
        initialValues={emptyOrderedResponseForm(ID)}
        onSaveDraft={save()}
        onPublish={save()}
      />
    ),
  ],
  [
    "bowtie",
    () => (
      <BowtieEditor initialValues={emptyBowtieForm(ID)} onSaveDraft={save()} onPublish={save()} />
    ),
  ],
];

describe("tags in every item editor", () => {
  it.each(editors)("the %s editor has the tag fields", (_name, editor) => {
    render(editor());
    expect(screen.getByRole("heading", { name: "Tags" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Clinical judgment step" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Client needs" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Add topic tags" })).toBeInTheDocument();
  });

  it("saves tags and the step with the draft, and marks them unsaved until then", async () => {
    const onSaveDraft = vi.fn<(values: MultipleChoiceFormValues) => Promise<SaveResult>>(
      async () => ({ ok: true }),
    );
    render(
      <MultipleChoiceEditor
        initialValues={emptyMultipleChoiceForm(ID)}
        onSaveDraft={onSaveDraft}
        onPublish={save()}
      />,
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("checkbox", { name: "Physiological Adaptation" }));
    await user.type(screen.getByRole("textbox", { name: "Add topic tags" }), "Sepsis{Enter}");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Clinical judgment step" }),
      "Step 1: Recognize Cues",
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["Physiological Adaptation", "sepsis"], cjmmStep: 1 }),
    );
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("inside a case study, shows the step its place sets instead of offering a choice", () => {
    render(
      <ItemEditorHostContext.Provider value={{ inCaseStudy: true }}>
        <MultipleChoiceEditor
          initialValues={{ ...emptyMultipleChoiceForm(ID), cjmmStep: 2 }}
          onSaveDraft={save()}
          onPublish={save()}
        />
      </ItemEditorHostContext.Provider>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Tags" })).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Clinical judgment step" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Step 2: Analyze Cues")).toBeInTheDocument();
  });
});
