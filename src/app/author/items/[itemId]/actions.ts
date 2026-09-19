"use server";

import { revalidatePath } from "next/cache";
import type { SaveResult } from "@/components/authoring/EditorShell";
import { fromDropdownClozeForm, fromDropdownRationaleForm } from "@/lib/authoring/forms/cloze";
import { fromBowtieForm } from "@/lib/authoring/forms/bowtie";
import { parseBowtieDraft } from "@/lib/authoring/forms/bowtieDraft";
import { parseClozeDraft } from "@/lib/authoring/forms/clozeDraft";
import type { DraftParseResult } from "@/lib/authoring/forms/draft";
import { fromDragdropClozeForm, fromDragdropRationaleForm } from "@/lib/authoring/forms/dragdrop";
import { parseDragDropDraft } from "@/lib/authoring/forms/dragdropDraft";
import { fromDropdownTableForm } from "@/lib/authoring/forms/dropdownTable";
import { parseDropdownTableDraft } from "@/lib/authoring/forms/dropdownTableDraft";
import { fromHighlightTableForm, fromHighlightTextForm } from "@/lib/authoring/forms/highlight";
import {
  parseHighlightTableDraft,
  parseHighlightTextDraft,
} from "@/lib/authoring/forms/highlightDraft";
import { fromOrderedResponseForm } from "@/lib/authoring/forms/orderedResponse";
import { parseOrderedResponseDraft } from "@/lib/authoring/forms/orderedResponseDraft";
import {
  fromMatrixMultipleChoiceForm,
  fromMatrixMultipleResponseForm,
} from "@/lib/authoring/forms/matrix";
import { parseMatrixDraft } from "@/lib/authoring/forms/matrixDraft";
import { fromMultipleChoiceForm } from "@/lib/authoring/forms/multipleChoice";
import { parseMultipleChoiceDraft } from "@/lib/authoring/forms/multipleChoiceDraft";
import { fromMultipleResponseForm } from "@/lib/authoring/forms/multipleResponse";
import { parseMultipleResponseDraft } from "@/lib/authoring/forms/multipleResponseDraft";
import { fromGroupingForm } from "@/lib/authoring/forms/multipleResponseGrouping";
import { parseGroupingDraft } from "@/lib/authoring/forms/multipleResponseGroupingDraft";
import { pinnedStepFor } from "@/lib/authoring/caseStudies";
import { isUuid } from "@/lib/authoring/ids";
import { withinItemSizeLimit } from "@/lib/authoring/payloadSize";
import { checkPublishable } from "@/lib/authoring/publishCheck";
import { checkRateLimit } from "@/lib/authoring/rateLimit";
import { requireAuthor } from "@/lib/authoring/session";
import { nextPublishedVersion } from "@/lib/authoring/versions";
import type { ItemType } from "@/lib/ngn/labels";
import type { Item } from "@/lib/ngn/schemas";
import type { Json } from "@/lib/supabase/database.types";
import { toItemRow } from "@/lib/supabase/itemRows";

const GONE: SaveResult = { ok: false, error: "This item no longer exists." };
const TOO_LARGE: SaveResult = {
  ok: false,
  error: "This item is too large to save. Shorten the longest text, or split it into two items.",
};
const SAVE_FAILED: SaveResult = { ok: false, error: "The draft could not be saved. Try again." };
const PUBLISH_FAILED: SaveResult = {
  ok: false,
  error: "The item could not be published. Try again.",
};

function revalidateItem(itemId: string) {
  revalidatePath(`/author/items/${itemId}`);
  revalidatePath("/author/banks/[bankId]", "page");
  // A step item saved inside the case study builder changes that case study's rail.
  revalidatePath("/author/case-studies/[caseStudyId]", "page");
}

/**
 * Stores a draft. The request's size is checked before anything is parsed, then it must pass its
 * type's strict draft schema. A draft need not be a valid item, but it has the item's shape, so it
 * splits into columns the same way. The update is pinned to the row's type, so a draft can never
 * change what kind of item a row is.
 */
async function saveDraft<Values>(
  itemId: string,
  type: ItemType,
  values: unknown,
  parse: (values: unknown) => DraftParseResult<Values>,
  toInput: (values: Values) => unknown,
): Promise<SaveResult> {
  if (!isUuid(itemId)) return GONE;
  if (!withinItemSizeLimit(values)) return TOO_LARGE;
  const draft = parse(values);
  if (!draft.ok) return { ok: false, error: draft.error };

  const { supabase } = await requireAuthor(`/author/items/${itemId}`);
  const limit = await checkRateLimit(supabase, "save");
  if (!limit.ok) return limit;
  // A case study step's position decides its clinical judgment step, not the submitted form.
  const pinned = await pinnedStepFor(supabase, itemId);
  const row = toItemRow(toInput(draft.values) as Item);
  const { data, error } = await supabase
    .from("items")
    .update({
      content: row.content,
      answer_key: row.answer_key,
      rationale: row.rationale,
      scoring: row.scoring,
      tags: row.tags,
      cjmm_step: pinned ?? row.cjmm_step,
      status: "draft",
    })
    .eq("id", itemId)
    .eq("type", type)
    .select("id");
  if (error) return SAVE_FAILED;
  if (data.length === 0) return GONE;

  revalidateItem(itemId);
  return { ok: true };
}

/**
 * Publishes only a schema-valid item of the row's own type with a general rationale (spec §6),
 * within the size limit, and appends a snapshot to its version history. The server sets the version
 * (from stored history) and the id (from the route); neither is taken from the submitted item.
 */
async function publish(itemId: string, type: ItemType, input: unknown): Promise<SaveResult> {
  if (!isUuid(itemId)) return GONE;
  if (!withinItemSizeLimit(input)) return TOO_LARGE;
  const checked = checkPublishable(input, type);
  if (!checked.ok) return { ok: false, error: checked.error };

  const { supabase, orgId } = await requireAuthor(`/author/items/${itemId}`);
  const limit = await checkRateLimit(supabase, "publish");
  if (!limit.ok) return limit;
  const { data: latest, error: latestError } = await supabase
    .from("item_versions")
    .select("version")
    .eq("item_id", itemId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return PUBLISH_FAILED;

  const version = nextPublishedVersion(latest?.version ?? null);
  // A case study step's position decides its clinical judgment step, in the row and the snapshot.
  const pinned = await pinnedStepFor(supabase, itemId);
  const item = { ...checked.item, id: itemId, version, ...(pinned ? { cjmmStep: pinned } : {}) };
  const row = toItemRow(item);

  const { data, error } = await supabase
    .from("items")
    .update({
      content: row.content,
      answer_key: row.answer_key,
      rationale: row.rationale,
      scoring: row.scoring,
      tags: row.tags,
      cjmm_step: row.cjmm_step,
      version,
      status: "published",
    })
    .eq("id", itemId)
    .eq("type", type)
    .select("id");
  if (error) return PUBLISH_FAILED;
  if (data.length === 0) return GONE;

  const { error: versionError } = await supabase.from("item_versions").insert({
    item_id: itemId,
    org_id: orgId,
    version,
    snapshot: JSON.parse(JSON.stringify(item)) as Json,
  });
  if (versionError) {
    return {
      ok: false,
      error: "The item was published, but its version history was not recorded. Publish again.",
    };
  }

  revalidateItem(itemId);
  return { ok: true };
}

export async function saveMultipleChoiceDraft(
  itemId: string,
  values: unknown,
): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "multiple_choice",
    values,
    parseMultipleChoiceDraft,
    fromMultipleChoiceForm,
  );
}

export async function publishMultipleChoice(itemId: string, input: unknown): Promise<SaveResult> {
  return publish(itemId, "multiple_choice", input);
}

export async function saveMultipleResponseDraft(
  itemId: string,
  values: unknown,
): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "multiple_response",
    values,
    parseMultipleResponseDraft,
    fromMultipleResponseForm,
  );
}

export async function publishMultipleResponse(itemId: string, input: unknown): Promise<SaveResult> {
  return publish(itemId, "multiple_response", input);
}

export async function saveGroupingDraft(itemId: string, values: unknown): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "multiple_response_grouping",
    values,
    parseGroupingDraft,
    fromGroupingForm,
  );
}

export async function publishGrouping(itemId: string, input: unknown): Promise<SaveResult> {
  return publish(itemId, "multiple_response_grouping", input);
}

export async function saveMatrixMultipleChoiceDraft(
  itemId: string,
  values: unknown,
): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "matrix_multiple_choice",
    values,
    parseMatrixDraft,
    fromMatrixMultipleChoiceForm,
  );
}

export async function publishMatrixMultipleChoice(
  itemId: string,
  input: unknown,
): Promise<SaveResult> {
  return publish(itemId, "matrix_multiple_choice", input);
}

export async function saveMatrixMultipleResponseDraft(
  itemId: string,
  values: unknown,
): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "matrix_multiple_response",
    values,
    parseMatrixDraft,
    fromMatrixMultipleResponseForm,
  );
}

export async function publishMatrixMultipleResponse(
  itemId: string,
  input: unknown,
): Promise<SaveResult> {
  return publish(itemId, "matrix_multiple_response", input);
}

export async function saveDropdownTableDraft(itemId: string, values: unknown): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "dropdown_table",
    values,
    parseDropdownTableDraft,
    fromDropdownTableForm,
  );
}

export async function publishDropdownTable(itemId: string, input: unknown): Promise<SaveResult> {
  return publish(itemId, "dropdown_table", input);
}

export async function saveDropdownClozeDraft(itemId: string, values: unknown): Promise<SaveResult> {
  return saveDraft(itemId, "dropdown_cloze", values, parseClozeDraft, fromDropdownClozeForm);
}

export async function publishDropdownCloze(itemId: string, input: unknown): Promise<SaveResult> {
  return publish(itemId, "dropdown_cloze", input);
}

export async function saveDropdownRationaleDraft(
  itemId: string,
  values: unknown,
): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "dropdown_rationale",
    values,
    parseClozeDraft,
    fromDropdownRationaleForm,
  );
}

export async function publishDropdownRationale(
  itemId: string,
  input: unknown,
): Promise<SaveResult> {
  return publish(itemId, "dropdown_rationale", input);
}

export async function saveHighlightTextDraft(itemId: string, values: unknown): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "highlight_text",
    values,
    parseHighlightTextDraft,
    fromHighlightTextForm,
  );
}

export async function publishHighlightText(itemId: string, input: unknown): Promise<SaveResult> {
  return publish(itemId, "highlight_text", input);
}

export async function saveHighlightTableDraft(
  itemId: string,
  values: unknown,
): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "highlight_table",
    values,
    parseHighlightTableDraft,
    fromHighlightTableForm,
  );
}

export async function publishHighlightTable(itemId: string, input: unknown): Promise<SaveResult> {
  return publish(itemId, "highlight_table", input);
}

export async function saveDragdropClozeDraft(itemId: string, values: unknown): Promise<SaveResult> {
  return saveDraft(itemId, "dragdrop_cloze", values, parseDragDropDraft, fromDragdropClozeForm);
}

export async function publishDragdropCloze(itemId: string, input: unknown): Promise<SaveResult> {
  return publish(itemId, "dragdrop_cloze", input);
}

export async function saveDragdropRationaleDraft(
  itemId: string,
  values: unknown,
): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "dragdrop_rationale",
    values,
    parseDragDropDraft,
    fromDragdropRationaleForm,
  );
}

export async function publishDragdropRationale(
  itemId: string,
  input: unknown,
): Promise<SaveResult> {
  return publish(itemId, "dragdrop_rationale", input);
}

export async function saveOrderedResponseDraft(
  itemId: string,
  values: unknown,
): Promise<SaveResult> {
  return saveDraft(
    itemId,
    "ordered_response",
    values,
    parseOrderedResponseDraft,
    fromOrderedResponseForm,
  );
}

export async function publishOrderedResponse(itemId: string, input: unknown): Promise<SaveResult> {
  return publish(itemId, "ordered_response", input);
}

export async function saveBowtieDraft(itemId: string, values: unknown): Promise<SaveResult> {
  return saveDraft(itemId, "bowtie", values, parseBowtieDraft, fromBowtieForm);
}

export async function publishBowtie(itemId: string, input: unknown): Promise<SaveResult> {
  return publish(itemId, "bowtie", input);
}
