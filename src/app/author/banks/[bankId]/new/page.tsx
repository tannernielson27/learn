import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewItemChooser } from "@/components/authoring/NewItemChooser";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { PageHeader } from "@/components/ui/PageHeader";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { createItem } from "../../../actions";

export const metadata: Metadata = { title: "New question" };

export default async function NewItemPage({ params }: PageProps<"/author/banks/[bankId]/new">) {
  const { bankId } = await params;
  if (!isUuid(bankId)) notFound();

  const { supabase } = await requireAuthor(`/author/banks/${bankId}/new`);
  const { data: bank } = await supabase
    .from("item_banks")
    .select("id, name")
    .eq("id", bankId)
    .maybeSingle();
  if (!bank) notFound();

  return (
    <ReadingWidth>
      {/* The way up is the quiz, by its own name. */}
      <PageHeader
        className="mb-6"
        back={{ href: `/author/banks/${bank.id}`, label: bank.name }}
        title="New question"
      />
      <NewItemChooser create={createItem.bind(null, bank.id)} />
    </ReadingWidth>
  );
}
