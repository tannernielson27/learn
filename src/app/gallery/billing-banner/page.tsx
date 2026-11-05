import { BillingBanner } from "@/components/billing/BillingBanner";
import {
  bannerFixture,
  bannerFixtureLabel,
  parseBannerFixture,
} from "@/lib/billing/bannerFixtures";

/**
 * The author pages' billing banner (#522) drawn from `bannerFixtures.ts`, with no database and no
 * Stripe behind it, so the screenshot suite covers each state. `?state=` picks one. Dates are
 * fixed to the fixtures' `now`, so the screens never drift.
 *
 * Opened by URL, not from the gallery nav, as `/gallery/billing` is: a nav entry would change the
 * sidebar in every full-page gallery baseline.
 */
export default async function BillingBannerGallery({
  searchParams,
}: PageProps<"/gallery/billing-banner">) {
  const name = parseBannerFixture((await searchParams).state);
  return (
    <article>
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">Billing banner</h1>
      <p className="mt-2 mb-8 max-w-prose text-ink-2">
        {bannerFixtureLabel(name)}. Shown across the top of the teacher pages only.
      </p>
      <div
        data-testid="billing-banner-demo"
        className="overflow-hidden rounded-md border border-line"
      >
        <BillingBanner banner={bannerFixture(name)} />
      </div>
    </article>
  );
}
