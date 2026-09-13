import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ItemEditorLoader,
  type ItemEditorLoaderProps,
} from "@/components/authoring/ItemEditorLoader";
import { clozeFormFromStored } from "@/lib/authoring/forms/cloze";
import { dragDropFormFromStored } from "@/lib/authoring/forms/dragdrop";
import { dropdownTableFormFromStored } from "@/lib/authoring/forms/dropdownTable";
import {
  highlightTableFormFromStored,
  highlightTextFormFromStored,
} from "@/lib/authoring/forms/highlight";
import { matrixFormFromStored } from "@/lib/authoring/forms/matrix";
import { multipleChoiceFormFromStored } from "@/lib/authoring/forms/multipleChoice";
import { multipleResponseFormFromStored } from "@/lib/authoring/forms/multipleResponse";
import { groupingFormFromStored } from "@/lib/authoring/forms/multipleResponseGrouping";
import { isRecord } from "@/lib/authoring/forms/storedValues";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";

export const metadata: Metadata = { title: "Edit item" };

const STATUS_LABELS = { draft: "Draft", published: "Published", archived: "Archived" } as const;

/** Chooses the editor for a stored row, or null when this type's editor has not shipped yet. */
function editorFor(rowId: string, type: string, stored: unknown): ItemEditorLoaderProps | null {
  switch (type) {
    case "multiple_choice":
      return { itemId: rowId, type, initialValues: multipleChoiceFormFromStored(stored, rowId) };
    case "multiple_response":
      return { itemId: rowId, type, initialValues: multipleResponseFormFromStored(stored, rowId) };
    case "multiple_response_grouping":
      return { itemId: rowId, type, initialValues: groupingFormFromStored(stored, rowId) };
    case "matrix_multiple_choice":
    case "matrix_multiple_response":
      return { itemId: rowId, type, initialValues: matrixFormFromStored(stored, rowId) };
    case "dropdown_table":
      return { itemId: rowId, type, initialValues: dropdownTableFormFromStored(stored, rowId) };
    case "dropdown_cloze":
    case "dropdown_rationale":
      return { itemId: rowId, type, initialValues: clozeFormFromStored(stored, rowId) };
    case "highlight_text":
      return { itemId: rowId, type, initialValues: highlightTextFormFromStored(stored, rowId) };
    case "highlight_table":
      return { itemId: rowId, type, initialValues: highlightTableFormFromStored(stored, rowId) };
    case "dragdrop_cloze":
    case "dragdrop_rationale":
      return { itemId: rowId, type, initialValues: dragDropFormFromStored(stored, rowId) };
    // Ordered response and bowtie editors arrive later in Sprint 5.
    default:
      return null;
  }
}

export default async function EditItemPage({ params }: PageProps<"/author/items/[itemId]">) {
  const { itemId } = await params;
  if (!isUuid(itemId)) notFound();

  const { supabase } = await requireAuthor(`/author/items/${itemId}`);
  // Authors may read their own org's keys (ADR 0003); RLS limits this row to the author's org.
  const { data: row } = await supabase
    .from("items")
    .select(
      "id, bank_id, type, cjmm_step, tags, version, status, content, answer_key, rationale, scoring",
    )
    .eq("id", itemId)
    .maybeSingle();
  if (!row) notFound();

  const label = (ITEM_TYPES as readonly string[]).includes(row.type)
    ? ITEM_TYPE_LABELS[row.type as ItemType]
    : row.type;

  const stored = {
    ...(isRecord(row.content) ? row.content : {}),
    type: row.type,
    cjmmStep: row.cjmm_step ?? undefined,
    tags: row.tags,
    version: row.version,
    answerKey: row.answer_key,
    rationale: row.rationale,
    scoring: row.scoring,
  };
  const editor = editorFor(row.id, row.type, stored);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href={`/author/banks/${row.bank_id}`}
          className="text-accent-ink underline-offset-4 hover:underline"
        >
          Back to bank
        </Link>
      </p>
      <p className="eyebrow mb-1">{label}</p>
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="font-read text-3xl text-ink-1">Edit item</h1>
        <p className="text-sm text-ink-2">{STATUS_LABELS[row.status]}</p>
      </div>
      {editor ? (
        <ItemEditorLoader {...editor} />
      ) : (
        <p className="text-ink-2">
          The editor for this item type arrives in a later story this sprint.
        </p>
      )}
    </>
  );
}
