"use client";

import { useHydrated } from "@/components/assignments/useHydrated";
import { BillingSection, type BillingActionState } from "@/components/workspace/BillingSection";
import { BILLING_FIXTURES, type BillingFixtureName } from "@/lib/billing/billingFixtures";

/** Gallery-only: nothing is sent anywhere. */
const notHere = async (): Promise<BillingActionState> => ({
  status: "error",
  error: "Not in the gallery.",
});

export function BillingDemo({ name }: { name: BillingFixtureName }) {
  const hydrated = useHydrated();
  const fixture = BILLING_FIXTURES[name];
  return (
    <div data-hydrated={hydrated} data-testid="billing-demo" className="max-w-2xl">
      <BillingSection
        access={fixture.access}
        configured={fixture.configured}
        trialAvailable={fixture.trialAvailable}
        checkoutAction={notHere}
        portalAction={notHere}
      />
    </div>
  );
}
