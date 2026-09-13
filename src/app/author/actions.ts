"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BankFormState } from "@/components/authoring/CreateBankForm";
import type { CaseStudyFormState } from "@/components/authoring/CreateCaseStudyForm";
import type { ImportFormState } from "@/components/authoring/ImportJsonForm";
import { importIntoBank as writeImport } from "@/lib/authoring/importExport";
import { readImportText } from "@/lib/authoring/importForm";
import { importRowsFor, importSummary, parseImport } from "@/lib/authoring/transfer";
import { parseBankForm } from "@/lib/authoring/bankForm";
import { createCaseStudy } from "@/lib/authoring/caseStudies";
import { parseCaseStudyTitle } from "@/lib/authoring/caseStudyForm";
import { isUuid } from "@/lib/authoring/ids";
import { isEditorReady } from "@/lib/authoring/itemTypeGroups";
import { requireAuthor } from "@/lib/authoring/session";
import { ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Signs out this browser only; other devices keep their sessions. */
export async function signOut(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in");
}

export async function createBank(
  _previous: BankFormState,
  formData: FormData,
): Promise<BankFormState> {
  const parsed = parseBankForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase, orgId, userId } = await requireAuthor("/author");
  const { data, error } = await supabase
    .from("item_banks")
    .insert({ name: parsed.name, org_id: orgId, created_by: userId })
    .select("id")
    .single();
  if (error) return { status: "error", error: "The bank could not be created. Try again." };

  revalidatePath("/author");
  redirect(`/author/banks/${data.id}`);
}

export async function renameBank(
  bankId: string,
  _previous: BankFormState,
  formData: FormData,
): Promise<BankFormState> {
  if (!isUuid(bankId)) return { status: "error", error: "That bank no longer exists." };
  const parsed = parseBankForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase } = await requireAuthor(`/author/banks/${bankId}`);
  const { data, error } = await supabase
    .from("item_banks")
    .update({ name: parsed.name })
    .eq("id", bankId)
    .select("id");
  if (error) return { status: "error", error: "The bank could not be renamed. Try again." };
  if (data.length === 0) return { status: "error", error: "That bank no longer exists." };

  revalidatePath("/author");
  revalidatePath(`/author/banks/${bankId}`);
  return { status: "saved" };
}

/** Starts a draft case study in a bank and opens it. Bound to the bank on the bank page. */
export async function createCaseStudyInBank(
  bankId: string,
  _previous: CaseStudyFormState,
  formData: FormData,
): Promise<CaseStudyFormState> {
  if (!isUuid(bankId)) return { status: "error", error: "That bank no longer exists." };
  const parsed = parseCaseStudyTitle(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const { supabase, orgId, userId } = await requireAuthor(`/author/banks/${bankId}`);
  const created = await createCaseStudy(supabase, {
    bankId,
    orgId,
    userId,
    title: parsed.title,
  });
  if (!created.ok) return { status: "error", error: created.error };

  revalidatePath(`/author/banks/${bankId}`);
  redirect(`/author/case-studies/${created.value.id}`);
}

/**
 * Imports a learn.v1 export into a bank as new drafts. The text is bounded and validated before
 * anything is written, then written in one database call, so a refused import writes nothing.
 */
export async function importIntoBank(
  bankId: string,
  _previous: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  if (!isUuid(bankId)) return { status: "error", errors: ["That bank no longer exists."] };
  const { supabase } = await requireAuthor(`/author/banks/${bankId}`);

  const read = await readImportText(formData);
  if (!read.ok) return { status: "error", errors: [read.error] };
  const parsed = parseImport(read.text);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const written = await writeImport(supabase, bankId, importRowsFor(parsed));
  if (!written.ok) return { status: "error", errors: [written.error] };

  revalidatePath(`/author/banks/${bankId}`);
  return { status: "done", message: importSummary(parsed) };
}

export interface CreateItemResult {
  error: string;
}

/** Starts a draft of the chosen type and opens it in the editor. */
export async function createItem(bankId: string, type: ItemType): Promise<CreateItemResult> {
  if (!isUuid(bankId)) return { error: "That bank no longer exists." };
  if (!(ITEM_TYPES as readonly string[]).includes(type) || !isEditorReady(type)) {
    return { error: "That item type cannot be authored yet." };
  }

  const { supabase, orgId, userId } = await requireAuthor(`/author/banks/${bankId}/new`);
  const { data, error } = await supabase
    .from("items")
    .insert({
      bank_id: bankId,
      org_id: orgId,
      type,
      status: "draft",
      // An empty draft. The editor (#69) fills it in and validates it before publishing.
      content: { stem: { kind: "markdown", value: "" } },
      answer_key: {},
      scoring: {},
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return { error: "The item could not be created. Try again." };

  revalidatePath(`/author/banks/${bankId}`);
  redirect(`/author/items/${data.id}`);
}
