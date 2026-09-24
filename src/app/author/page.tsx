import type { Metadata } from "next";
import Link from "next/link";
import { BankList } from "@/components/authoring/BankList";
import { CreateBankForm } from "@/components/authoring/CreateBankForm";
import { listBanks } from "@/lib/authoring/banks";
import { requireAuthor } from "@/lib/authoring/session";
import { CLASSES_PATH } from "@/lib/classes/classes";
import { listSharedClassNamesByBank } from "@/lib/supabase/practiceShares";
import { SESSIONS_PATH } from "@/lib/live/reportFormat";
import { createBank } from "./actions";

export const metadata: Metadata = { title: "Item banks" };

export default async function AuthorHomePage() {
  const { supabase } = await requireAuthor("/author");
  // Both in one round trip: the badges are one read of the org's shares, not one per bank.
  const [banks, sharedWith] = await Promise.all([
    listBanks(supabase),
    listSharedClassNamesByBank(supabase),
  ]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="font-read text-3xl text-ink-1">Item banks</h1>
        <nav aria-label="More" className="flex flex-wrap gap-x-4">
          <Link
            href={CLASSES_PATH}
            className="tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline"
          >
            Classes
          </Link>
          <Link
            href={SESSIONS_PATH}
            className="tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline"
          >
            Live sessions and reports
          </Link>
        </nav>
      </div>
      <BankList banks={banks} sharedWith={sharedWith} />
      <section aria-labelledby="new-bank-heading" className="mt-10 border-t border-line pt-6">
        <h2 id="new-bank-heading" className="mb-3 text-lg font-medium text-ink-1">
          New bank
        </h2>
        <CreateBankForm action={createBank} />
      </section>
    </>
  );
}
