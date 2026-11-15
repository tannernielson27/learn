import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { STATE_IDS } from "../src/app/gallery/states/states";

// #563: every route's loading, error and not-found screen, from `/gallery/states` (no database,
// no error thrown), so each has a baseline at 375 and 1280 in light and in dark. Needs no stack,
// so it runs against every preview.
const SCHEMES = ["light", "dark"] as const;

for (const state of STATE_IDS) {
  test(`the ${state} screen: one h1, its controls, accessibility and its baselines`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/gallery/states?state=${state}`);
    const demo = page.getByTestId("states-demo");
    await expect(demo).toHaveAttribute("data-state", state);
    await page.evaluate(() => document.fonts.ready);

    await expect(demo.getByRole("heading", { level: 1 })).toHaveCount(1);
    if (state.startsWith("loading-")) {
      await expect(demo.getByRole("status")).toHaveText(/^Loading /);
      await expect(demo.locator(".animate-pulse")).toHaveCount(0);
    } else {
      const heading = demo.getByRole("heading", { level: 1 });
      // A state that replaces a page starts there, for a keyboard and a screen reader.
      await expect(heading).toBeFocused();
      const links = demo.locator("[data-error-state] a");
      expect(await links.count()).toBeGreaterThanOrEqual(1);
      for (const link of await links.all()) {
        expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }
    if (state.startsWith("error-")) {
      const retry = demo.getByRole("button", { name: "Try again", exact: true });
      await expect(retry).toBeVisible();
      expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect(demo.getByRole("alert")).toBeVisible();
    }

    for (const colorScheme of SCHEMES) {
      await page.emulateMedia({ colorScheme });
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations, colorScheme).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      // Baselines at the two widths the quality bar names (docs/04 §12); the tablet run checks
      // the layout and accessibility only.
      if (testInfo.project.name !== "tablet-768") {
        await expect(demo).toHaveScreenshot(`states-${state}-${colorScheme}.png`);
      }
    }
  });
}
