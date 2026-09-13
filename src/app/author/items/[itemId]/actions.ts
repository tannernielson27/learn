"use server";

import { revalidatePath } from "next/cache";
import type { SaveResult } from "@/components/authoring/EditorShell";
import { fromDropdownClozeForm, fromDropdownRationaleForm } from "@/lib/authoring/forms/cloze";
import { parseClozeDraft } from "@/lib/authoring/forms/clozeDraft";
import type { DraftParseResult } from "@/lib/authoring/forms/draft";
import { fromDropdownTableForm } from "@/lib/authoring/forms/dropdownTable";
import { parseDropdownTableDraft } from "@/lib/authoring/forms/dropdownTableDraft";
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
import { isUuid } from "@/lib/authoring/ids";
import { withinItemSizeLimit } from "@/lib/authoring/payloadSize";
import { requireAuthor } from "@/lib/authoring/session";
import { nextPublishedVersion } from "@/lib/authoring/versions";
import type { ItemType } from "@/lib/ngn/labels";
import type { Item } from "@/lib/ngn/schemas";
import { validateItem } from "@/lib/ngn/validate";
import type { Json } from "@/lib/supabase/database.types";
import { toItemRow } from "@/lib/supabase/itemRows";

const GONE: SaveResult = { ok: false, error: "This item no longer exists." };
const TOO_LARGE: SaveResult = {
  ok: false,
  error: "This item is too large to save. Shorten the longest text, or split it into two items.",
};
const SAVE_FAILED: SaveResult = { ok: false, error: "The draft could not be saved. Try again." };
const INCOMPLETE: SaveResult = {
  ok: false,
  error: "The item is not complete yet. Fix the problems listed, then publish.",
};
const PUBLISH_FAILED: SaveResult = {
  ok: false,
  error: "The item could not be published. Try again.",
};

function revalidateItem(itemId: string) {
  revalidatePath(`/author/items/${itemId}`);
  revalidatePath("/author/banks/[bankId]", "page");
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
  const row = toItemRow(toInput(draft.values) as Item);
  const { data, error } = await supabase
    .from("items")
    .update({
      content: row.content,
      answer_key: row.answer_key,
      rationale: row.rationale,
      scoring: row.scoring,
      tags: row.tags,
      cjmm_step: row.cjmm_step,
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
 * Publishes only a schema-valid item of the row's own type, within the size limit, and appends a
 * snapshot to its version history. The server sets the version (from stored history) and the id
 * (from the route); neither is taken from the submitted item.
 */
async function publish(itemId: string, type: ItemType, input: unknown): Promise<SaveResult> {
  if (!isUuid(itemId)) return GONE;
  if (!withinItemSizeLimit(input)) return TOO_LARGE;
  const result = validateItem(input);
  if (!result.ok || result.value.type !== type) return INCOMPLETE;

  const { supabase, orgId } = await requireAuthor(`/author/items/${itemId}`);
  const { data: latest, error: latestError } = await supabase
    .from("item_versions")
    .select("version")
    .eq("item_id", itemId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return PUBLISH_FAILED;

  const version = nextPublishedVersion(latest?.version ?? null);
  const item = { ...result.value, id: itemId, version };
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
