import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewItemChooser } from "@/components/authoring/NewItemChooser";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { TextLink } from "@/components/ui/TextLink";
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
      <p className="mb-2">
        <TextLink href={`/author/banks/${bank.id}`} size="sm">
          {bank.name}
        </TextLink>
      </p>
      <h1 className="mb-6 font-read text-3xl text-ink-1">New question</h1>
      <NewItemChooser create={createItem.bind(null, bank.id)} />
    </ReadingWidth>
  );
}
