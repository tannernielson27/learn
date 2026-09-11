import { expect, test, type Page } from "@playwright/test";

// The motion pass (docs/04-DESIGN-DIRECTION.md §5): feedback marks stagger in 40ms apart and the
// whole reveal ends within 320ms; with reduced motion there is no stagger, only a short fade.

async function submitHighlight(page: Page) {
  await page.goto("/gallery/items/highlight_text");
  await page.locator('[data-hydrated="true"]').waitFor();
  for (const name of [
    "Heart rate 54 and irregular",
    "Oxygen saturation 91% on 2 L nasal cannula",
    "Blood pressure 128/78",
  ]) {
    await page.getByRole("button", { name }).click();
  }
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("complementary", { name: "Score" })).toBeVisible();
}

const visibleMarkDelays = (page: Page) =>
  page
    .locator("[data-feedback-mark]")
    .evaluateAll((marks) =>
      marks
        .filter((mark) => (mark as HTMLElement).offsetParent !== null)
        .map((mark) => getComputedStyle(mark).animationDelay),
    );

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "motion timing is the same at every width");
});

test("feedback marks stagger in 40ms apart", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await submitHighlight(page);
  // Two correct, one incorrect and one missed phrase: four marks.
  expect(await visibleMarkDelays(page)).toEqual(["0s", "0.04s", "0.08s", "0.12s"]);
});

test("with reduced motion the marks appear without a stagger", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await submitHighlight(page);
  expect(await visibleMarkDelays(page)).toEqual(["0s", "0s", "0s", "0s"]);
});
