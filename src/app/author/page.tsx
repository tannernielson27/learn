import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { BankList } from "@/components/authoring/BankList";
import { CreateBankForm } from "@/components/authoring/CreateBankForm";
import { GetStarted } from "@/components/onboarding/GetStarted";
import { listBanks } from "@/lib/authoring/banks";
import { requireAuthor } from "@/lib/authoring/session";
import { CLASSES_PATH } from "@/lib/classes/classes";
import {
  checklistSteps,
  GET_STARTED_COOKIE,
  hiddenFor,
  showChecklist,
} from "@/lib/onboarding/checklist";
import { readOrgProgress } from "@/lib/onboarding/progress";
import { listSharedClassNamesByBank } from "@/lib/supabase/practiceShares";
import { SESSIONS_PATH } from "@/lib/live/reportFormat";
import { createBank } from "./actions";
import { hideGetStarted, importSample } from "./onboardingActions";

export const metadata: Metadata = { title: "Item banks" };

export default async function AuthorHomePage() {
  const { supabase, orgId, userId } = await requireAuthor("/author");
  // Both in one round trip: the badges are one read of the org's shares, not one per bank.
  const [banks, sharedWith] = await Promise.all([
    listBanks(supabase),
    listSharedClassNamesByBank(supabase),
  ]);
  // Get started (#265): hidden on this browser, or worked out from the org's own rows.
  const hidden = hiddenFor((await cookies()).get(GET_STARTED_COOKIE)?.value, userId);
  const progress = hidden ? null : await readOrgProgress(supabase, orgId, banks);
  const steps = progress ? checklistSteps(progress) : [];

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
      {/* After the h1, so the heading outline reads Item banks, then Get started. */}
      {showChecklist(steps, hidden) ? (
        <GetStarted steps={steps} importSample={importSample} hide={hideGetStarted} />
      ) : null}
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
