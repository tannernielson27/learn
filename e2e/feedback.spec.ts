import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ready = async (page: Page, type: string) => {
  await page.goto(`/gallery/items/${type}`);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

test("feedback explains each choice where it was made", async ({ page }, testInfo) => {
  await ready(page, "multiple_response");

  const wrong = page.getByRole("checkbox", { name: /Temperature 37.2/ });
  // Nothing explains anything while the item is still open.
  await expect(page.getByText(/barely raised and expected/)).toHaveCount(0);

  await page.getByRole("checkbox", { name: /Respiratory rate 28/ }).click();
  await wrong.click();
  await page.getByRole("button", { name: "Submit" }).click();

  // The explanation sits with the option, and is read after it.
  await expect(page.getByText(/barely raised and expected with pneumonia/)).toBeVisible();
  await expect(wrong).toHaveAccessibleDescription(/barely raised and expected/);

  const breakdown = page.getByRole("list", { name: "Score breakdown" });
  await expect(breakdown.getByRole("listitem")).toHaveCount(4);
  await expect(breakdown).toContainText("+1");
  await expect(breakdown).toContainText("-1");

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/feedback-rationale.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("feedback-rationale.png", { fullPage: true });
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
});
