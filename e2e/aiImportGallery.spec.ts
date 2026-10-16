import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// #349: the AI import review screen from the gallery, with fictional unkeyed questions. Its
// desktop baseline is the teacher guide's figure (public/help/ai-import-review.png, a byte copy
// checked by src/lib/help/itemGuide.test.ts). Needs no stack, so it runs against every preview.
test("the AI import review screen: layout, accessibility and its baseline", async ({ page }) => {
  await page.goto("/gallery/ai-import");
  const demo = page.getByTestId("ai-import-review-demo");
  await expect(demo).toHaveAttribute("data-hydrated", "true");
  // The staged question is drawn by its real player, which loads after hydration.
  await expect(demo.getByText("4 ounces of fruit juice")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  for (const status of ["Needs an answer", "Needs a fix", "Not importable"]) {
    await expect(demo.getByTestId("entry-status").filter({ hasText: status })).toBeVisible();
  }
  // Two kept questions, held back until both are fixed or dropped.
  await expect(demo.getByTestId("import-button")).toHaveText("Import 2 questions");
  await expect(demo.getByTestId("import-button")).toBeDisabled();

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await expect(demo).toHaveScreenshot("ai-import-review.png");
});
