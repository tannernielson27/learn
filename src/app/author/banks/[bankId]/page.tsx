import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateBankForm } from "@/components/authoring/CreateBankForm";
import { ItemList } from "@/components/authoring/ItemList";
import { listItems } from "@/lib/authoring/banks";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { renameBank } from "../../actions";

export const metadata: Metadata = { title: "Item bank" };

export default async function BankPage({ params }: PageProps<"/author/banks/[bankId]">) {
  const { bankId } = await params;
  if (!isUuid(bankId)) notFound();

  const { supabase } = await requireAuthor(`/author/banks/${bankId}`);
  const { data: bank } = await supabase
    .from("item_banks")
    .select("id, name")
    .eq("id", bankId)
    .maybeSingle();
  if (!bank) notFound();

  const items = await listItems(supabase, bank.id);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/author" className="text-accent-ink underline-offset-4 hover:underline">
          Item banks
        </Link>
      </p>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-read text-3xl text-ink-1">{bank.name}</h1>
        <Link
          href={`/author/banks/${bank.id}/new`}
          className="tap-target inline-flex items-center rounded-sm border border-accent bg-accent px-4 font-medium text-accent-contrast hover:bg-accent-ink"
        >
          New item
        </Link>
      </div>
      <ItemList items={items} />
      <details className="mt-10 border-t border-line pt-6">
        <summary className="tap-target flex cursor-pointer items-center text-sm font-medium text-ink-2">
          Rename bank
        </summary>
        <div className="mt-3">
          <CreateBankForm
            action={renameBank.bind(null, bank.id)}
            initialName={bank.name}
            submitLabel="Save name"
          />
        </div>
      </details>
    </>
  );
}
