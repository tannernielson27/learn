// Test-only: ItemEditorLoader's editors without next/dynamic, so a test can draw a page's editor in
// one render. Saving and publishing always succeed.
import type { ItemEditorLoaderProps } from "../ItemEditorLoader";
import { BowtieEditor } from "../BowtieEditor";
import { ClozeEditor } from "../ClozeEditor";
import { DragDropEditor } from "../DragDropEditor";
import { DropdownTableEditor } from "../DropdownTableEditor";
import { GroupingEditor } from "../GroupingEditor";
import { HighlightTableEditor } from "../HighlightTableEditor";
import { HighlightTextEditor } from "../HighlightTextEditor";
import { MatrixEditor } from "../MatrixEditor";
import { MultipleChoiceEditor } from "../MultipleChoiceEditor";
import { MultipleResponseEditor } from "../MultipleResponseEditor";
import { OrderedResponseEditor } from "../OrderedResponseEditor";

const saved = async () => ({ ok: true });

export function SyncItemEditor(props: ItemEditorLoaderProps) {
  const save = { onSaveDraft: saved, onPublish: saved };
  switch (props.type) {
    case "multiple_choice":
      return <MultipleChoiceEditor initialValues={props.initialValues} {...save} />;
    case "multiple_response":
      return <MultipleResponseEditor initialValues={props.initialValues} {...save} />;
    case "multiple_response_grouping":
      return <GroupingEditor initialValues={props.initialValues} {...save} />;
    case "matrix_multiple_choice":
    case "matrix_multiple_response":
      return <MatrixEditor type={props.type} initialValues={props.initialValues} {...save} />;
    case "dropdown_table":
      return <DropdownTableEditor initialValues={props.initialValues} {...save} />;
    case "dropdown_cloze":
    case "dropdown_rationale":
      return <ClozeEditor type={props.type} initialValues={props.initialValues} {...save} />;
    case "highlight_text":
      return <HighlightTextEditor initialValues={props.initialValues} {...save} />;
    case "highlight_table":
      return <HighlightTableEditor initialValues={props.initialValues} {...save} />;
    case "dragdrop_cloze":
    case "dragdrop_rationale":
      return <DragDropEditor type={props.type} initialValues={props.initialValues} {...save} />;
    case "ordered_response":
      return <OrderedResponseEditor initialValues={props.initialValues} {...save} />;
    case "bowtie":
      return <BowtieEditor initialValues={props.initialValues} {...save} />;
  }
}
