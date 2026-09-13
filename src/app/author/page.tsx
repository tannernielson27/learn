import type { Metadata } from "next";
import { BankList } from "@/components/authoring/BankList";
import { CreateBankForm } from "@/components/authoring/CreateBankForm";
import { listBanks } from "@/lib/authoring/banks";
import { requireAuthor } from "@/lib/authoring/session";
import { createBank } from "./actions";

export const metadata: Metadata = { title: "Item banks" };

export default async function AuthorHomePage() {
  const { supabase } = await requireAuthor("/author");
  const banks = await listBanks(supabase);

  return (
    <>
      <h1 className="mb-6 font-read text-3xl text-ink-1">Item banks</h1>
      <BankList banks={banks} />
      <section aria-labelledby="new-bank-heading" className="mt-10 border-t border-line pt-6">
        <h2 id="new-bank-heading" className="mb-3 text-lg font-medium text-ink-1">
          New bank
        </h2>
        <CreateBankForm action={createBank} />
      </section>
    </>
  );
}
