import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * The end-of-session podium on a 1280×720 stage, from the gallery's fixtures. Captured with
 * `page.screenshot` into test-results/screenshots for a person to look at, rather than as a
 * visual-diff baseline, until baselines are regenerated on CI (docs/05). The context asks for
 * reduced motion, so every place is already there.
 */
test("the end-of-session podium: places, ties, accessibility", async ({ page }, testInfo) => {
  await page.goto("/gallery/live/podium");
  await expect(
    page.getByRole("heading", { level: 1, name: "End of session podium", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const five = page.getByTestId("podium-five-places");
  await expect(five.getByText("1st", { exact: true })).toBeVisible();
  await expect(five.getByText("Marisol Okonkwo-Fitzgerald", { exact: true })).toBeVisible();
  await expect(five.getByText("5th", { exact: true })).toBeVisible();

  const ties = page.getByTestId("podium-ties");
  await expect(ties.locator('[data-place="1"]')).toContainText("1st, tied");
  await expect(ties.getByText("4th, tied", { exact: true })).toBeVisible();

  const large = page.getByTestId("podium-large-tie");
  await expect(large.getByText("and 3 more", { exact: true })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);

  for (const name of ["five-places", "ties", "large-tie"]) {
    await page.getByTestId(`podium-${name}`).screenshot({
      path: `test-results/screenshots/${testInfo.project.name}/podium-${name}.png`,
    });
  }
});
