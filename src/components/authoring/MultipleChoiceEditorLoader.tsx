"use client";

import dynamic from "next/dynamic";
import {
  publishMultipleChoice,
  saveMultipleChoiceDraft,
} from "@/app/author/items/[itemId]/actions";
import type { MultipleChoiceFormValues } from "@/lib/authoring/forms/multipleChoice";

// The editor, its form library and the schemas load only on this route, never on the player.
const MultipleChoiceEditor = dynamic(
  () => import("./MultipleChoiceEditor").then((module) => module.MultipleChoiceEditor),
  { ssr: false, loading: () => <p className="text-ink-2">Loading the editor…</p> },
);

export interface MultipleChoiceEditorLoaderProps {
  itemId: string;
  initialValues: MultipleChoiceFormValues;
}

export function MultipleChoiceEditorLoader({
  itemId,
  initialValues,
}: MultipleChoiceEditorLoaderProps) {
  return (
    <MultipleChoiceEditor
      initialValues={initialValues}
      onSaveDraft={(values) => saveMultipleChoiceDraft(itemId, values)}
      onPublish={(item) => publishMultipleChoice(itemId, item)}
    />
  );
}
