"use client";

import dynamic from "next/dynamic";
import {
  publishGrouping,
  publishMultipleChoice,
  publishMultipleResponse,
  saveGroupingDraft,
  saveMultipleChoiceDraft,
  saveMultipleResponseDraft,
} from "@/app/author/items/[itemId]/actions";
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

export type ItemEditorLoaderProps =
  | { itemId: string; type: "multiple_choice"; initialValues: MultipleChoiceFormValues }
  | { itemId: string; type: "multiple_response"; initialValues: MultipleResponseFormValues }
  | { itemId: string; type: "multiple_response_grouping"; initialValues: GroupingFormValues };

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
  }
}
