import { CircleAlert, CreditCard } from "lucide-react";
import { GuardedLink } from "@/components/authoring/LeaveGuard";
import { Icon } from "@/components/ui/Icon";
import { textLinkClasses } from "@/components/ui/TextLink";
import type { BillingBanner as BillingBannerData, BillingBannerKind } from "@/lib/billing/banner";

/**
 * A failed payment and ended free access stop work (or will, once billing is enforced): they take
 * the alert's look, the strong rule down the leading edge and the alert mark, as `Notice role="alert"`
 * does (#563). An ending trial or subscription is a heads-up and stays calm.
 */
export const BANNER_ALERT_KINDS: ReadonlySet<BillingBannerKind> = new Set([
  "payment_failed",
  "access_ended",
]);

/**
 * The billing banner across the top of every author page (#522, ADR 0016): one sentence, and
 * either the way to Billing (for the person who started the workspace) or who to ask. It blocks
 * nothing and moves nothing: a neutral system message (docs/04, `--notice`), never feedback red.
 *
 * A labelled region rather than a live one: it is drawn with the page, not into it, so a screen
 * reader finds it among the landmarks without having every navigation announce it again. The link
 * asks the page first, as the header's links do, so leaving unsaved work still asks.
 *
 * Only the author layout draws it. No student page, live join or practice page imports it.
 */
export function BillingBanner({ banner }: { banner: BillingBannerData | null }) {
  if (!banner) return null;
  const alert = BANNER_ALERT_KINDS.has(banner.kind);
  return (
    <section
      aria-label="Billing notice"
      data-billing-banner={banner.kind}
      data-tone={alert ? "alert" : "status"}
      className={`border-b border-line bg-notice-soft py-3 pr-4 text-notice md:pr-8 ${
        alert ? "border-l-4 border-l-rule-strong pl-3 md:pl-7" : "pl-4 md:pl-8"
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon icon={alert ? CircleAlert : CreditCard} className="mt-0.5 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-base leading-snug">
            <span className="font-semibold">{banner.message}</span>
            {banner.note ? <span className="text-ink-2"> {banner.note}</span> : null}
          </p>
          {banner.link ? (
            <GuardedLink href={banner.link.href} className={textLinkClasses({ size: "sm" })}>
              {banner.link.label}
            </GuardedLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}
