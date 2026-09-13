"use client";

import dynamic from "next/dynamic";
import {
  publishBowtie,
  publishDragdropCloze,
  publishDragdropRationale,
  publishDropdownCloze,
  publishDropdownRationale,
  publishDropdownTable,
  publishGrouping,
  publishHighlightTable,
  publishHighlightText,
  publishMatrixMultipleChoice,
  publishMatrixMultipleResponse,
  publishMultipleChoice,
  publishMultipleResponse,
  publishOrderedResponse,
  saveBowtieDraft,
  saveDragdropClozeDraft,
  saveDragdropRationaleDraft,
  saveDropdownClozeDraft,
  saveDropdownRationaleDraft,
  saveDropdownTableDraft,
  saveGroupingDraft,
  saveHighlightTableDraft,
  saveHighlightTextDraft,
  saveMatrixMultipleChoiceDraft,
  saveMatrixMultipleResponseDraft,
  saveMultipleChoiceDraft,
  saveMultipleResponseDraft,
  saveOrderedResponseDraft,
} from "@/app/author/items/[itemId]/actions";
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

// Each editor, its form library and the schemas load only on the item page, never on the player.
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

export function ItemEditorLoader(props: ItemEditorLoaderProps) {
  const { itemId } = props;
  switch (props.type) {
    case "multiple_choice":
      return (
        <MultipleChoiceEditor
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveMultipleChoiceDraft(itemId, values)}
          onPublish={(item) => publishMultipleChoice(itemId, item)}
        />
      );
    case "multiple_response":
      return (
        <MultipleResponseEditor
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveMultipleResponseDraft(itemId, values)}
          onPublish={(item) => publishMultipleResponse(itemId, item)}
        />
      );
    case "multiple_response_grouping":
      return (
        <GroupingEditor
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveGroupingDraft(itemId, values)}
          onPublish={(item) => publishGrouping(itemId, item)}
        />
      );
    case "matrix_multiple_choice":
      return (
        <MatrixEditor
          type="matrix_multiple_choice"
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveMatrixMultipleChoiceDraft(itemId, values)}
          onPublish={(item) => publishMatrixMultipleChoice(itemId, item)}
        />
      );
    case "matrix_multiple_response":
      return (
        <MatrixEditor
          type="matrix_multiple_response"
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveMatrixMultipleResponseDraft(itemId, values)}
          onPublish={(item) => publishMatrixMultipleResponse(itemId, item)}
        />
      );
    case "dropdown_table":
      return (
        <DropdownTableEditor
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveDropdownTableDraft(itemId, values)}
          onPublish={(item) => publishDropdownTable(itemId, item)}
        />
      );
    case "dropdown_cloze":
      return (
        <ClozeEditor
          type="dropdown_cloze"
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveDropdownClozeDraft(itemId, values)}
          onPublish={(item) => publishDropdownCloze(itemId, item)}
        />
      );
    case "dropdown_rationale":
      return (
        <ClozeEditor
          type="dropdown_rationale"
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveDropdownRationaleDraft(itemId, values)}
          onPublish={(item) => publishDropdownRationale(itemId, item)}
        />
      );
    case "highlight_text":
      return (
        <HighlightTextEditor
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveHighlightTextDraft(itemId, values)}
          onPublish={(item) => publishHighlightText(itemId, item)}
        />
      );
    case "highlight_table":
      return (
        <HighlightTableEditor
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveHighlightTableDraft(itemId, values)}
          onPublish={(item) => publishHighlightTable(itemId, item)}
        />
      );
    case "dragdrop_cloze":
      return (
        <DragDropEditor
          type="dragdrop_cloze"
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveDragdropClozeDraft(itemId, values)}
          onPublish={(item) => publishDragdropCloze(itemId, item)}
        />
      );
    case "dragdrop_rationale":
      return (
        <DragDropEditor
          type="dragdrop_rationale"
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveDragdropRationaleDraft(itemId, values)}
          onPublish={(item) => publishDragdropRationale(itemId, item)}
        />
      );
    case "ordered_response":
      return (
        <OrderedResponseEditor
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveOrderedResponseDraft(itemId, values)}
          onPublish={(item) => publishOrderedResponse(itemId, item)}
        />
      );
    case "bowtie":
      return (
        <BowtieEditor
          initialValues={props.initialValues}
          onSaveDraft={(values) => saveBowtieDraft(itemId, values)}
          onPublish={(item) => publishBowtie(itemId, item)}
        />
      );
  }
}
