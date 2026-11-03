import { BILLING_FIXTURES, parseBillingFixture } from "@/lib/billing/billingFixtures";
import { BillingDemo } from "./demo";

/**
 * The workspace page's Billing section (#519) drawn from `billingFixtures.ts`, with no database
 * and no Stripe behind it, so the screenshot suite covers each state. `?state=` picks one; every
 * button answers that it is not available here.
 *
 * Opened by URL, not from the gallery nav, as `/gallery/class-page` is: a nav entry would change
 * the sidebar in every full-page gallery baseline.
 */
export default async function BillingGallery({ searchParams }: PageProps<"/gallery/billing">) {
  const name = parseBillingFixture((await searchParams).state);
  return (
    <article>
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">Billing section</h1>
      <p className="mt-2 mb-8 max-w-prose text-ink-2">
        {BILLING_FIXTURES[name].label}. Every button answers that it is not available here.
      </p>
      <BillingDemo name={name} />
    </article>
  );
}
