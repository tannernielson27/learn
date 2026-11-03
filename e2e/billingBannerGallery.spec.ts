import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The author pages' billing banner (#522) in each state, from the gallery's fixtures: no database
// and no Stripe, so it runs in CI (which has no Stripe keys) and against every preview. Screens go
// to test-results/screenshots at 375, 768 and 1280, as the Billing section's do.
const STATES = [
  ["trial-ending", "Your free trial ends on 5 November 2026.", "Manage billing"],
  ["trial-ending-colleague", "The person who started your workspace manages billing.", null],
  ["payment-failed", "Your last payment did not go through.", "Manage billing"],
  ["payment-failed-colleague", "The person who started your workspace manages billing.", null],
  ["subscription-ending", "Your subscription ends on 8 November 2026.", "Manage billing"],
  ["access-ended", "Your free access has ended.", "Start a free trial or subscribe"],
  ["access-ended-colleague", "The person who started your workspace manages billing.", null],
] as const;

for (const [state, text, link] of STATES) {
  test(`the billing banner, ${state}: layout, accessibility and a screen`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/gallery/billing-banner?state=${state}`);
    const demo = page.getByTestId("billing-banner-demo");
    await page.evaluate(() => document.fonts.ready);

    const banner = demo.getByRole("region", { name: "Billing notice" });
    await expect(banner).toContainText(text);
    if (link) {
      const control = banner.getByRole("link", { name: link, exact: true });
      await expect(control).toHaveAttribute("href", "/author/workspace#billing-heading");
      expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      // Reachable from the keyboard.
      await control.focus();
      await expect(control).toBeFocused();
    } else {
      await expect(banner.getByRole("link")).toHaveCount(0);
    }
    await expect(banner).not.toContainText(
      /\b(org|organi[sz]ation|founder|member|seat|paywall|beta|grandfather\w*|pass|plan)\b/i,
    );

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await demo.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}/billing-banner-${state}.png`,
    });
  });
}
