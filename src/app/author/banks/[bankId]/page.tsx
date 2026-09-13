import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseStudyList } from "@/components/authoring/CaseStudyList";
import { CreateBankForm } from "@/components/authoring/CreateBankForm";
import { CreateCaseStudyForm } from "@/components/authoring/CreateCaseStudyForm";
import { ImportJsonForm } from "@/components/authoring/ImportJsonForm";
import { ItemList } from "@/components/authoring/ItemList";
import { listCaseStudies, listItems } from "@/lib/authoring/banks";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { createCaseStudyInBank, importIntoBank, renameBank } from "../../actions";

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

  const [items, caseStudies] = await Promise.all([
    listItems(supabase, bank.id),
    listCaseStudies(supabase, bank.id),
  ]);

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
      <section aria-labelledby="case-studies-heading" className="mt-10 flex flex-col gap-4">
        <h2 id="case-studies-heading" className="font-read text-2xl text-ink-1">
          Case studies
        </h2>
        <CaseStudyList caseStudies={caseStudies} />
        <CreateCaseStudyForm action={createCaseStudyInBank.bind(null, bank.id)} />
      </section>
      <section aria-labelledby="import-heading" className="mt-10 flex flex-col gap-4">
        <h2 id="import-heading" className="font-read text-2xl text-ink-1">
          Import JSON
        </h2>
        <ImportJsonForm action={importIntoBank.bind(null, bank.id)} />
      </section>
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
