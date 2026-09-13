import type { SupabaseClient } from "@supabase/supabase-js";
import { caseStudyBlockers, type CaseStudyStepState } from "@/lib/authoring/caseStudyReadiness";
import { fromEhrForm } from "@/lib/authoring/forms/ehr";
import { parseEhrDraft } from "@/lib/authoring/forms/ehrDraft";
import { withinItemSizeLimit } from "@/lib/authoring/payloadSize";
import type { ItemType } from "@/lib/ngn/labels";
import type { CjmmStep } from "@/lib/ngn/types";
import { validateCaseStudy } from "@/lib/ngn/validate";
import type { Database, Json } from "@/lib/supabase/database.types";
import { fromItemRow } from "@/lib/supabase/itemRows";

type Client = SupabaseClient<Database>;

export type CaseStudyResult<T = undefined> =
  { ok: true; value: T } | { ok: false; error: string; blockers?: string[] };

export const CASE_STUDY_ERRORS = {
  gone: "This case study no longer exists.",
  failed: "The case study could not be saved. Try again.",
  tooLarge: "This case study is too large to save. Shorten the longest record text.",
  wrongBank: "That item is in another bank. Use an item from this case study's bank.",
  alreadyStep: "That item is already a step in this case study. Choose a different item.",
  badOrder: "The steps could not be reordered. Reload the page and try again.",
  notReady: "The case study is not ready to publish yet.",
} as const;

/**
 * A new draft's record: one time point and no tabs yet. Valid to store, not to publish. The
 * patient's age and sex are left out rather than guessed (an age of 0 would read as a newborn),
 * so the record editor (#87) opens a header without them.
 */
export function emptyRecord(): Json {
  return {
    patientHeader: { setting: "" },
    timePoints: [{ id: "t1", label: "Admission" }],
    tabs: [],
  };
}

/** Starts a draft case study in a bank. RLS decides whether the caller may write that bank. */
export async function createCaseStudy(
  client: Client,
  args: { bankId: string; orgId: string; userId: string; title: string },
): Promise<CaseStudyResult<{ id: string }>> {
  const { data, error } = await client
    .from("case_studies")
    .insert({
      bank_id: args.bankId,
      org_id: args.orgId,
      title: args.title,
      ehr: emptyRecord(),
      status: "draft",
      created_by: args.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: CASE_STUDY_ERRORS.failed };
  return { ok: true, value: { id: data.id } };
}

/** Saves the record (EHR) as a draft; the whole case study is validated only at publish. */
export async function saveRecord(
  client: Client,
  caseStudyId: string,
  record: unknown,
): Promise<CaseStudyResult> {
  if (!withinItemSizeLimit(record)) return { ok: false, error: CASE_STUDY_ERRORS.tooLarge };
  const { data, error } = await client
    .from("case_studies")
    .update({ ehr: record as Json, status: "draft" })
    .eq("id", caseStudyId)
    .select("id");
  if (error) return { ok: false, error: CASE_STUDY_ERRORS.failed };
  if (data.length === 0) return { ok: false, error: CASE_STUDY_ERRORS.gone };
  return { ok: true, value: undefined };
}

/**
 * The record editor's Save: the request's size first, then the form's strict draft shape, then the
 * record it describes, stored as a draft. An unfinished record saves; publishing checks it whole.
 */
export async function saveRecordForm(
  client: Client,
  caseStudyId: string,
  values: unknown,
): Promise<CaseStudyResult> {
  if (!withinItemSizeLimit(values)) return { ok: false, error: CASE_STUDY_ERRORS.tooLarge };
  const draft = parseEhrDraft(values);
  if (!draft.ok) return { ok: false, error: draft.error };
  return saveRecord(client, caseStudyId, fromEhrForm(draft.values));
}

/**
 * The clinical judgment step an item is pinned to by its place in a case study, or null when it
 * is not a step. Saving and publishing an item write this rather than whatever the form carries,
 * so a draft saved from a half-written form can never unpin a step.
 */
export async function pinnedStepFor(client: Client, itemId: string): Promise<CjmmStep | null> {
  const { data, error } = await client
    .from("case_study_items")
    .select("position")
    .eq("item_id", itemId)
    .maybeSingle();
  if (error || !data) return null;
  return data.position as CjmmStep;
}

/**
 * Starts a step: a new draft item of the chosen type in the case study's own bank, pinned to the
 * step and placed at it. When the step already had an item (the author changed its type), the old
 * item is removed if it is still a draft; a published one stays in the bank. If placing fails, the
 * new item is removed again, so no orphan draft is left behind.
 */
export async function startStep(
  client: Client,
  args: { caseStudyId: string; position: CjmmStep; type: ItemType; userId: string },
): Promise<CaseStudyResult<{ itemId: string }>> {
  const { data: caseStudy } = await client
    .from("case_studies")
    .select("bank_id, org_id")
    .eq("id", args.caseStudyId)
    .maybeSingle();
  if (!caseStudy) return { ok: false, error: CASE_STUDY_ERRORS.gone };

  const { data: previous } = await client
    .from("case_study_items")
    .select("item_id")
    .eq("case_study_id", args.caseStudyId)
    .eq("position", args.position)
    .maybeSingle();

  const { data: created, error: createError } = await client
    .from("items")
    .insert({
      bank_id: caseStudy.bank_id,
      org_id: caseStudy.org_id,
      type: args.type,
      status: "draft",
      content: { stem: { kind: "markdown", value: "" } },
      answer_key: {},
      scoring: {},
      cjmm_step: args.position,
      created_by: args.userId,
    })
    .select("id")
    .single();
  if (createError || !created) return { ok: false, error: CASE_STUDY_ERRORS.failed };

  const placed = await placeStep(client, {
    caseStudyId: args.caseStudyId,
    position: args.position,
    itemId: created.id,
  });
  if (!placed.ok) {
    await client.from("items").delete().eq("id", created.id);
    return { ok: false, error: placed.error };
  }

  // A new step starts unfinished, so a published case study is a draft again until republished.
  await client.from("case_studies").update({ status: "draft" }).eq("id", args.caseStudyId);

  if (previous?.item_id) {
    // Best effort: a published item, or one the database still refuses to delete, simply stays.
    await client.from("items").delete().eq("id", previous.item_id).eq("status", "draft");
  }
  return { ok: true, value: { itemId: created.id } };
}

/**
 * Places an item at a position, or replaces the item already there, in one database call that also
 * sets the item's CJMM step to the position. The bank and org come from the case study itself.
 */
export async function placeStep(
  client: Client,
  args: { caseStudyId: string; position: CjmmStep; itemId: string },
): Promise<CaseStudyResult> {
  const { error } = await client.rpc("place_case_study_step", {
    target: args.caseStudyId,
    step_position: args.position,
    step_item: args.itemId,
  });
  if (!error) return { ok: true, value: undefined };
  // 23503: the item is in another bank (or org). 23505: it is already another step here.
  if (error.code === "23503") return { ok: false, error: CASE_STUDY_ERRORS.wrongBank };
  if (error.code === "23505") return { ok: false, error: CASE_STUDY_ERRORS.alreadyStep };
  return { ok: false, error: CASE_STUDY_ERRORS.failed };
}

/** Reorders every step at once through the database function, so no state ever loses a step. */
export async function reorderSteps(
  client: Client,
  caseStudyId: string,
  itemIds: readonly string[],
): Promise<CaseStudyResult> {
  const { error } = await client.rpc("reorder_case_study_steps", {
    target: caseStudyId,
    item_ids: [...itemIds],
  });
  if (error) return { ok: false, error: CASE_STUDY_ERRORS.badOrder };
  return { ok: true, value: undefined };
}

/**
 * Publishes only a case study whose record, title and six steps are all ready, validated against
 * the whole case study schema. Returns the builder's plain reasons when it is not ready.
 */
export async function publishCaseStudy(
  client: Client,
  caseStudyId: string,
): Promise<CaseStudyResult> {
  const { data: row, error } = await client
    .from("case_studies")
    // After the migration there are two keys between these tables (org and bank), so PostgREST
    // refuses an unnamed embed as ambiguous; name the org keys, which every step row has.
    .select(
      "id, title, tags, ehr, case_study_items!case_study_items_case_org_fkey (position, item_id, items!case_study_items_item_org_fkey (id, type, cjmm_step, tags, version, status, content, answer_key, rationale, scoring))",
    )
    .eq("id", caseStudyId)
    .maybeSingle();
  if (error) return { ok: false, error: CASE_STUDY_ERRORS.failed };
  if (!row) return { ok: false, error: CASE_STUDY_ERRORS.gone };

  const record = row.ehr as { tabs?: unknown[] } | null;
  const steps: CaseStudyStepState[] = row.case_study_items.map((step) => {
    const stored = step.items ? fromItemRow(step.items) : null;
    return {
      position: step.position as CjmmStep,
      itemId: step.item_id,
      itemReady: Boolean(stored?.ok && step.items?.status === "published"),
      // Caught here with its own reason, instead of failing validateCaseStudy's step check vaguely.
      wrongStep: Boolean(step.items && step.items.cjmm_step !== step.position),
    };
  });
  const blockers = caseStudyBlockers({
    titleWritten: row.title.trim().length > 0,
    recordTabCount: Array.isArray(record?.tabs) ? record.tabs.length : 0,
    steps,
  });
  if (blockers.length > 0) return { ok: false, error: CASE_STUDY_ERRORS.notReady, blockers };

  const items = [...row.case_study_items]
    .sort((a, b) => a.position - b.position)
    .map((step) => (step.items ? fromItemRow(step.items) : null))
    .map((stored) => (stored?.ok ? stored.value : null));
  const validated = validateCaseStudy({
    id: row.id,
    title: row.title,
    tags: row.tags,
    ehr: row.ehr,
    items,
  });
  if (!validated.ok) {
    return {
      ok: false,
      error: CASE_STUDY_ERRORS.notReady,
      blockers: ["Check each step and the record, then try again."],
    };
  }

  const { error: publishError } = await client
    .from("case_studies")
    .update({ status: "published" })
    .eq("id", caseStudyId);
  if (publishError) return { ok: false, error: CASE_STUDY_ERRORS.failed };
  return { ok: true, value: undefined };
}
