import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewItemChooser } from "@/components/authoring/NewItemChooser";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { createItem } from "../../../actions";

export const metadata: Metadata = { title: "New item" };

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
    <>
      <p className="mb-2 text-sm">
        <Link
          href={`/author/banks/${bank.id}`}
          className="text-accent-ink underline-offset-4 hover:underline"
        >
          {bank.name}
        </Link>
      </p>
      <h1 className="mb-2 font-read text-3xl text-ink-1">New item</h1>
      <p className="mb-6 text-ink-2">Choose the format. You can write the item next.</p>
      <NewItemChooser create={createItem.bind(null, bank.id)} />
    </>
  );
}
