import { PRESS_CLASSES } from "@/components/ui/Button";

export type BrandButtonVariant = "solid" | "outline";

const base =
  "tap-target inline-flex min-h-(--button-height-lg) items-center justify-center gap-2 rounded-md px-6 " +
  `text-lg font-semibold whitespace-nowrap select-none ${PRESS_CLASSES}`;

const variants: Record<BrandButtonVariant, string> = {
  // The one lit button on the band: paper on navy.
  solid:
    "border border-brand-action bg-brand-action text-brand-action-ink hover:bg-brand-action-hover",
  // A 5.3:1 edge on the band, so the button is seen as one (WCAG 1.4.11).
  outline:
    "border border-brand-line-strong bg-transparent text-brand-ink hover:bg-brand-surface-raised",
};

/**
 * A link that looks like a button, on the marketing pages' navy band (#563). The app's `Button`
 * is drawn for paper and its blue fill is too dark to read as a control on navy, so the band has
 * its own two: `solid` for the main action and `outline` beside it.
 */
export function brandButtonClasses(variant: BrandButtonVariant = "solid", block = false): string {
  return `${base} ${variants[variant]}${block ? " w-full" : ""}`;
}
