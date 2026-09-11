import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ITEM_TYPES } from "../src/lib/ngn/schemas";

/**
 * Every gallery item route, at each viewport project in playwright.config.ts:
 * a full-page screenshot for the workflow artifact, and no serious or critical axe violations.
 */
for (const type of ITEM_TYPES) {
  test(`${type}: screenshot and accessibility`, async ({ page }, testInfo) => {
    await page.goto(`/gallery/items/${type}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Deterministic ready signal: the gallery harness marks itself once React has hydrated.
    // (Server-rendered markup is visible earlier, and capturing mid-hydration can fail.)
    await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await page.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}/${type}.png`,
      fullPage: true,
    });

    // Visual diff against the committed baselines, in CI only: they are generated on the Linux
    // runner and fonts render differently on other systems (docs/05, "Visual baselines").
    if (process.env.CI) {
      await expect(page).toHaveScreenshot(`${type}.png`, { fullPage: true });
    }

    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target).join(", ")}`);
    expect(blocking).toEqual([]);
  });
}
