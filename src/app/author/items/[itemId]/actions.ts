"use server";

import { revalidatePath } from "next/cache";
import type { SaveResult } from "@/components/authoring/MultipleChoiceEditor";
import { fromMultipleChoiceForm } from "@/lib/authoring/forms/multipleChoice";
import { parseMultipleChoiceDraft } from "@/lib/authoring/forms/multipleChoiceDraft";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { nextPublishedVersion } from "@/lib/authoring/versions";
import type { Item } from "@/lib/ngn/schemas";
import { validateItem } from "@/lib/ngn/validate";
import type { Json } from "@/lib/supabase/database.types";
import { toItemRow } from "@/lib/supabase/itemRows";

const GONE: SaveResult = { ok: false, error: "This item no longer exists." };
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

/** Stores the form as it stands, complete or not, and marks the item a draft. */
export async function saveMultipleChoiceDraft(
  itemId: string,
  values: unknown,
): Promise<SaveResult> {
  if (!isUuid(itemId)) return GONE;
  const draft = parseMultipleChoiceDraft(values);
  if (!draft.ok) return { ok: false, error: draft.error };

  const { supabase } = await requireAuthor(`/author/items/${itemId}`);
  // A draft need not be a valid item, but it has the item's shape, so it splits the same way.
  const row = toItemRow(fromMultipleChoiceForm(draft.values) as unknown as Item);
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
    .eq("type", "multiple_choice")
    .select("id");
  if (error) return SAVE_FAILED;
  if (data.length === 0) return GONE;

  revalidateItem(itemId);
  return { ok: true };
}

/** Publishes only a schema-valid item, and appends a snapshot to its version history. */
export async function publishMultipleChoice(itemId: string, input: unknown): Promise<SaveResult> {
  if (!isUuid(itemId)) return GONE;
  const result = validateItem(input);
  if (!result.ok || result.value.type !== "multiple_choice") return INCOMPLETE;

  const { supabase, orgId } = await requireAuthor(`/author/items/${itemId}`);
  const { data: latest, error: latestError } = await supabase
    .from("item_versions")
    .select("version")
    .eq("item_id", itemId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return PUBLISH_FAILED;

  // The server decides the version and the id; neither is taken from the submitted item.
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
    .eq("type", "multiple_choice")
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
