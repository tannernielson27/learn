import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const blocking = (violations: { impact?: string | null; id: string; help: string }[]) =>
  violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help}`);

const ready = async (page: Page, path: string) => {
  await page.goto(path);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

test("a flagged step can be found again and returned to", async ({ page }, testInfo) => {
  await ready(page, "/gallery/case-study");

  await page.getByRole("button", { name: "Flag step 1" }).click();
  await expect(page.getByRole("button", { name: "Flag step 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: /sudden shortness of breath/ }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.locator("[data-step-indicator]")).toContainText("Step 2 of 6");

  await page.getByRole("button", { name: "Review" }).click();
  const list = page.getByRole("region", { name: "Review this case study" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("button").first()).toContainText("Answered, flagged for review");
  await expect(list.getByRole("button").nth(1)).toContainText("Not answered");

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/review-list.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("review-list.png", { fullPage: true });
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(blocking(violations)).toEqual([]);

  await list.getByRole("button", { name: /Step 1/ }).click();
  await expect(page.locator("[data-step-indicator]")).toContainText("Step 1 of 6");
  // The answer is as it was given, and focus is on the step rather than where the list used to be.
  await expect(page.getByRole("button", { name: /sudden shortness of breath/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("group", { name: /Step 1 of 6/ })).toBeFocused();
});

test("review mode replays an answer without the key", async ({ page }) => {
  await ready(page, "/gallery/items/multiple_choice");

  const chosen = page.getByRole("radio", { name: /Document the weight/ });
  await chosen.click();
  await page.getByRole("radio", { name: "Review" }).click();

  await expect(chosen).toBeChecked();
  await expect(chosen).toBeDisabled();
  // Nothing marks it right or wrong, and there is nothing to submit.
  await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Score" })).toHaveCount(0);
  await expect(page.getByText("Missed")).toHaveCount(0);

  // Back to answering, with the answer still there.
  await page.getByRole("radio", { name: "Answer" }).click();
  await expect(chosen).toBeChecked();
  await expect(chosen).toBeEnabled();
});
