"use client";

import dynamic from "next/dynamic";
import {
  publishDropdownCloze,
  publishDropdownRationale,
  publishDropdownTable,
  publishGrouping,
  publishMatrixMultipleChoice,
  publishMatrixMultipleResponse,
  publishMultipleChoice,
  publishMultipleResponse,
  saveDropdownClozeDraft,
  saveDropdownRationaleDraft,
  saveDropdownTableDraft,
  saveGroupingDraft,
  saveMatrixMultipleChoiceDraft,
  saveMatrixMultipleResponseDraft,
  saveMultipleChoiceDraft,
  saveMultipleResponseDraft,
} from "@/app/author/items/[itemId]/actions";
import type { ClozeFormValues } from "@/lib/authoring/forms/cloze";
import type { DropdownTableFormValues } from "@/lib/authoring/forms/dropdownTable";
import type { MatrixFormValues } from "@/lib/authoring/forms/matrix";
import type { MultipleChoiceFormValues } from "@/lib/authoring/forms/multipleChoice";
import type { MultipleResponseFormValues } from "@/lib/authoring/forms/multipleResponse";
import type { GroupingFormValues } from "@/lib/authoring/forms/multipleResponseGrouping";

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

export type ItemEditorLoaderProps =
  | { itemId: string; type: "multiple_choice"; initialValues: MultipleChoiceFormValues }
  | { itemId: string; type: "multiple_response"; initialValues: MultipleResponseFormValues }
  | { itemId: string; type: "multiple_response_grouping"; initialValues: GroupingFormValues }
  | { itemId: string; type: "matrix_multiple_choice"; initialValues: MatrixFormValues }
  | { itemId: string; type: "matrix_multiple_response"; initialValues: MatrixFormValues }
  | { itemId: string; type: "dropdown_table"; initialValues: DropdownTableFormValues }
  | { itemId: string; type: "dropdown_cloze"; initialValues: ClozeFormValues }
  | { itemId: string; type: "dropdown_rationale"; initialValues: ClozeFormValues };

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
  }
}
