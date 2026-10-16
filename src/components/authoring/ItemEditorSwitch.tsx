"use client";

import dynamic from "next/dynamic";
import type { BowtieFormValues } from "@/lib/authoring/forms/bowtie";
import type { ClozeFormValues } from "@/lib/authoring/forms/cloze";
import type { DragDropFormValues } from "@/lib/authoring/forms/dragdrop";
import type { DropdownTableFormValues } from "@/lib/authoring/forms/dropdownTable";
import type {
  HighlightTableFormValues,
  HighlightTextFormValues,
} from "@/lib/authoring/forms/highlight";
import type { MatrixFormValues } from "@/lib/authoring/forms/matrix";
import type { MultipleChoiceFormValues } from "@/lib/authoring/forms/multipleChoice";
import type { MultipleResponseFormValues } from "@/lib/authoring/forms/multipleResponse";
import type { GroupingFormValues } from "@/lib/authoring/forms/multipleResponseGrouping";
import type { OrderedResponseFormValues } from "@/lib/authoring/forms/orderedResponse";
import type { SaveResult } from "./EditorShell";

// Each editor, its form library and the schemas load only where an editor opens, never on the
// player.
const loading = () => <p className="text-ink-2">Loading the editor…</p>;

const MultipleChoiceEditor = dynamic(
  () => import("./MultipleChoiceEditor").then((module) => module.MultipleChoiceEditor),
  { ssr: false, loading },
);
const MultipleResponseEditor = dynamic(
  () => import("./MultipleResponseEditor").then((module) => module.MultipleResponseEditor),
  { ssr: false, loading },
);
const GroupingEditor = dynamic(
  () => import("./GroupingEditor").then((module) => module.GroupingEditor),
  { ssr: false, loading },
);
const MatrixEditor = dynamic(() => import("./MatrixEditor").then((module) => module.MatrixEditor), {
  ssr: false,
  loading,
});
const DropdownTableEditor = dynamic(
  () => import("./DropdownTableEditor").then((module) => module.DropdownTableEditor),
  { ssr: false, loading },
);
const ClozeEditor = dynamic(() => import("./ClozeEditor").then((module) => module.ClozeEditor), {
  ssr: false,
  loading,
});
const HighlightTextEditor = dynamic(
  () => import("./HighlightTextEditor").then((module) => module.HighlightTextEditor),
  { ssr: false, loading },
);
const HighlightTableEditor = dynamic(
  () => import("./HighlightTableEditor").then((module) => module.HighlightTableEditor),
  { ssr: false, loading },
);
const DragDropEditor = dynamic(
  () => import("./DragDropEditor").then((module) => module.DragDropEditor),
  { ssr: false, loading },
);
const OrderedResponseEditor = dynamic(
  () => import("./OrderedResponseEditor").then((module) => module.OrderedResponseEditor),
  { ssr: false, loading },
);
const BowtieEditor = dynamic(() => import("./BowtieEditor").then((module) => module.BowtieEditor), {
  ssr: false,
  loading,
});

/** An editor to open: the row it edits, its type and the form it opens with. */
export type ItemEditorLoaderProps =
  | { itemId: string; type: "multiple_choice"; initialValues: MultipleChoiceFormValues }
  | { itemId: string; type: "multiple_response"; initialValues: MultipleResponseFormValues }
  | { itemId: string; type: "multiple_response_grouping"; initialValues: GroupingFormValues }
  | { itemId: string; type: "matrix_multiple_choice"; initialValues: MatrixFormValues }
  | { itemId: string; type: "matrix_multiple_response"; initialValues: MatrixFormValues }
  | { itemId: string; type: "dropdown_table"; initialValues: DropdownTableFormValues }
  | { itemId: string; type: "dropdown_cloze"; initialValues: ClozeFormValues }
  | { itemId: string; type: "dropdown_rationale"; initialValues: ClozeFormValues }
  | { itemId: string; type: "highlight_text"; initialValues: HighlightTextFormValues }
  | { itemId: string; type: "highlight_table"; initialValues: HighlightTableFormValues }
  | { itemId: string; type: "dragdrop_cloze"; initialValues: DragDropFormValues }
  | { itemId: string; type: "dragdrop_rationale"; initialValues: DragDropFormValues }
  | { itemId: string; type: "ordered_response"; initialValues: OrderedResponseFormValues }
  | { itemId: string; type: "bowtie"; initialValues: BowtieFormValues };

export interface ItemEditorSwitchProps {
  editor: ItemEditorLoaderProps;
  /** Save is handed the form's values; the server reads them with the type's own draft check. */
  onSaveDraft: (values: unknown) => Promise<SaveResult>;
  /** Publish is handed the item input the form builds. */
  onPublish: (input: unknown) => Promise<SaveResult>;
}

/**
 * The editor for a type, with whatever Save and Publish its host gives it: an item row's own
 * (`ItemEditorLoader`), or a staged AI import question's (#347).
 */
export function ItemEditorSwitch({ editor, onSaveDraft, onPublish }: ItemEditorSwitchProps) {
  const handlers = { onSaveDraft, onPublish };
  switch (editor.type) {
    case "multiple_choice":
      return <MultipleChoiceEditor initialValues={editor.initialValues} {...handlers} />;
    case "multiple_response":
      return <MultipleResponseEditor initialValues={editor.initialValues} {...handlers} />;
    case "multiple_response_grouping":
      return <GroupingEditor initialValues={editor.initialValues} {...handlers} />;
    case "matrix_multiple_choice":
    case "matrix_multiple_response":
      return <MatrixEditor type={editor.type} initialValues={editor.initialValues} {...handlers} />;
    case "dropdown_table":
      return <DropdownTableEditor initialValues={editor.initialValues} {...handlers} />;
    case "dropdown_cloze":
    case "dropdown_rationale":
      return <ClozeEditor type={editor.type} initialValues={editor.initialValues} {...handlers} />;
    case "highlight_text":
      return <HighlightTextEditor initialValues={editor.initialValues} {...handlers} />;
    case "highlight_table":
      return <HighlightTableEditor initialValues={editor.initialValues} {...handlers} />;
    case "dragdrop_cloze":
    case "dragdrop_rationale":
      return (
        <DragDropEditor type={editor.type} initialValues={editor.initialValues} {...handlers} />
      );
    case "ordered_response":
      return <OrderedResponseEditor initialValues={editor.initialValues} {...handlers} />;
    case "bowtie":
      return <BowtieEditor initialValues={editor.initialValues} {...handlers} />;
  }
}
