import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { questionShown } from "./renderer";

const ready = async (page: Page) => {
  await page.goto("/gallery/case-study");
  await expect(page.getByRole("heading", { level: 1, name: "Case study" })).toBeVisible();
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

const blocking = (violations: { impact?: string | null; id: string; help: string }[]) =>
  violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help}`);

test("case study: screenshot and accessibility", async ({ page }, testInfo) => {
  await ready(page);
  await expect(page.locator("[data-step-indicator]")).toHaveText("Step 1 of 6: Recognize Cues");

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/case-study.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("case-study.png", { fullPage: true });
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(blocking(violations)).toEqual([]);
});

test("the six steps run end to end and land on a total", async ({ page }, testInfo) => {
  await ready(page);

  const submit = page.getByRole("button", { name: "Submit" });
  // A step's renderer loads when the step opens, so wait for it before counting its controls.
  const onStep = async (step: number) => {
    await expect(page.locator("[data-step-indicator]")).toContainText(`Step ${step} of 6`);
    await questionShown(page);
  };
  const clickAll = async (locator: ReturnType<Page["getByRole"]>) => {
    for (let i = 0; i < (await locator.count()); i++) await locator.nth(i).click();
  };
  const move = async (step: number) => {
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.getByRole("button", { name: step === 6 ? "See results" : "Next step" }).click();
  };

  // The sample's six formats, answered the way the demo script does. Each step's controls are
  // whatever its renderer offers, which is the point: the flow adds nothing to them.
  await onStep(1);
  await page.getByRole("button", { name: /sudden shortness of breath/ }).click();
  await move(1);

  await onStep(2);
  // One column per row is enough to complete a matrix multiple response.
  await clickAll(page.getByRole("checkbox", { name: /Pulmonary embolism/ }));
  await move(2);

  await onStep(3);
  const blanks = page.getByRole("combobox");
  for (let i = 0; i < (await blanks.count()); i++) await blanks.nth(i).selectOption({ index: 1 });
  await move(3);

  await onStep(4);
  await page.getByRole("checkbox", { name: /Titrate oxygen/ }).click();
  await move(4);

  // Ordered response opens already arranged, so it is complete before it is touched.
  await onStep(5);
  await move(5);

  await onStep(6);
  // "Not improving" is lower case, so this picks only the Improving column.
  await clickAll(page.getByRole("radio", { name: /Improving/ }));
  await move(6);

  const results = page.getByRole("region", { name: "Case study results" });
  await expect(results).toBeVisible();
  await expect(results).toContainText("of 19 points");
  await expect(results.getByRole("listitem")).toHaveCount(6);

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/case-study-results.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("case-study-results.png", { fullPage: true });
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(blocking(violations)).toEqual([]);
});

test("a submitted step can be reopened with its answer and score intact", async ({ page }) => {
  await ready(page);
  const firstSpan = page.getByRole("button", { name: /sudden shortness of breath/ });
  await firstSpan.click();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.locator("[data-step-indicator]")).toContainText("Step 2 of 6");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.locator("[data-step-indicator]")).toContainText("Step 1 of 6");
  await expect(page.getByRole("complementary", { name: "Score" })).toBeVisible();
  await expect(firstSpan).toHaveAttribute("aria-pressed", "true");
});
