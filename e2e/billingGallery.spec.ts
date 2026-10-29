import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The workspace page's Billing section (#519) in each state, from the gallery's fixtures: no
// database and no Stripe, so it runs in CI (which has no Stripe keys) and against every preview.
// Screens go to test-results/screenshots at 375, 768 and 1280, as the signed-in specs' do.
const STATES = [
  ["free", "This workspace has free access. There is nothing to pay.", null],
  ["trial", "Your free trial ends on 3 November 2026.", "Manage billing"],
  ["trial-cancelled", "Your subscription will not start when it ends.", "Manage billing"],
  ["active", "Your subscription renews on 3 December 2026.", "Manage billing"],
  ["ending", "Your subscription ends on 3 December 2026.", "Manage billing"],
  ["payment-failed", "A payment did not go through.", "Manage billing"],
  ["start-trial", "Start a 7-day free trial, then $39.99 a month", "Start your free trial"],
  ["subscribe", "Subscribe for $39.99 a month, for up to 10 teachers.", "Subscribe"],
  ["colleague", "The person who started this workspace manages billing.", null],
  ["not-configured", "This workspace does not have a subscription.", null],
] as const;

for (const [state, text, button] of STATES) {
  test(`the Billing section, ${state}: layout, accessibility and a screen`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/gallery/billing?state=${state}`);
    const demo = page.getByTestId("billing-demo");
    await expect(demo).toHaveAttribute("data-hydrated", "true");
    await page.evaluate(() => document.fonts.ready);

    const section = demo.getByRole("region", { name: "Billing" });
    await expect(section).toContainText(text);
    if (button) {
      const control = section.getByRole("button", { name: button, exact: true });
      await expect(control).toBeVisible();
      expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    } else {
      await expect(section.getByRole("button")).toHaveCount(0);
    }
    await expect(section).not.toContainText(/beta|grandfather|founder|member|seat|plan\b/i);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await demo.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}/billing-${state}.png`,
    });
  });
}

test("a refused press reads as one sentence, announced, and the button comes back", async ({
  page,
}) => {
  await page.goto("/gallery/billing?state=start-trial");
  const demo = page.getByTestId("billing-demo");
  await expect(demo).toHaveAttribute("data-hydrated", "true");
  await demo.getByRole("button", { name: "Start your free trial" }).click();
  await expect(demo.getByRole("alert")).toHaveText("Not in the gallery.");
  await expect(demo.getByRole("button", { name: "Start your free trial" })).toBeEnabled();
});
