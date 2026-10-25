import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * A student's own live session results, from the fixtures (`/gallery/live/student-results`): the
 * Live sessions list on their home and one ended session's results page. Screenshots of both at
 * every viewport, axe over the page, and no sideways scroll at 375px.
 */
const open = async (page: Page) => {
  await page.goto("/gallery/live/student-results");
  await expect(
    page.getByRole("heading", { level: 1, name: "Student live results", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

test("student live results: content, accessibility and layout", async ({ page }) => {
  await open(page);
  const list = page.getByRole("list", { name: "Live session history", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(
    list.getByRole("link", { name: "Results for Heart failure: fluid balance", exact: true }),
  ).toBeVisible();
  const results = page.getByTestId("gallery-live-results");
  await expect(results.getByRole("region", { name: "Your score", exact: true })).toBeVisible();
  await expect(
    results.getByRole("button", { name: "Review what I missed", exact: true }),
  ).toBeVisible();
  await expect(results.getByRole("complementary", { name: "Score", exact: true })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
});

for (const shot of [
  { name: "student-live-history.png", testId: "gallery-live-history" },
  { name: "student-live-results.png", testId: "gallery-live-results" },
]) {
  test(`student live results screenshot: ${shot.name}`, async ({ page }, testInfo) => {
    await open(page);
    const section = page.getByTestId(shot.testId);
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}/${shot.name}`,
      animations: "disabled",
    });
  });
}
