import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ready = async (page: import("@playwright/test").Page) => {
  await page.goto("/gallery/ehr");
  await expect(page.getByRole("heading", { level: 1, name: "EHR panel" })).toBeVisible();
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

test("EHR panel: screenshot and accessibility", async ({ page }, testInfo) => {
  await ready(page);

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/ehr-panel.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("ehr-panel.png", { fullPage: true });
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  const blocking = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target).join(", ")}`);
  expect(blocking).toEqual([]);
});

test("the record opens over the item below the two-pane breakpoint", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-1280", "the pane is always open at 1280px");
  await ready(page);

  const phone = testInfo.project.name === "phone-375";
  const chip = page.getByRole("button", { name: "Patient record" });
  await expect(chip).toBeVisible();
  if (phone) await chip.tap();
  else await chip.click();

  // A phone gets the modal sheet; a tablet gets the in-flow drawer. The pane behind them is
  // display:none at these widths, so the open record is the only one in the accessibility tree.
  const record = phone
    ? page.getByRole("dialog", { name: "Patient record" })
    : page.getByRole("tablist", { name: "Patient record sections" });
  await expect(record).toBeVisible();

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/ehr-panel-open.png`,
    fullPage: false,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("ehr-panel-open.png");
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(chip).toBeFocused();
});

test("an item points the reader at a charted section", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "the pane is the only always-open shape");
  await ready(page);

  await page.getByRole("radio", { name: "Labs" }).click();
  const tab = page.getByRole("tab", { name: "Lab Results" });
  await expect(tab).toHaveAttribute("aria-selected", "true");
  // Labs were only drawn at 1400, so pointing at them moves the clock to that time as well.
  await expect(page.getByRole("radio", { name: "Day 1, 1400" })).toBeChecked();
  // The strip scrolls sideways, so the section an item points at has to be brought into view.
  await expect(tab).toBeInViewport();
  // Abnormal values are tagged, never only coloured (docs/04-DESIGN-DIRECTION.md §6).
  const ddimer = page.getByRole("row").filter({ hasText: "D-dimer" });
  await expect(ddimer).toContainText("high");

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/ehr-panel-labs.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("ehr-panel-labs.png", { fullPage: true });
  }
});

test("the chart tabs page with an arrow rather than a scrollbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone-375", "chips are swiped at this width, not paged");
  await ready(page);

  if (testInfo.project.name === "tablet-768") {
    await page.getByRole("button", { name: "Patient record" }).click();
  }
  const strip = page.getByRole("tablist", { name: "Patient record sections" });
  const forward = page.locator('[data-strip-arrow="end"]').first();
  await expect(forward).toBeVisible();
  // Nothing to go back to until the strip has moved.
  await expect(page.locator('[data-strip-arrow="start"]').first()).toBeDisabled();

  const before = await strip.evaluate((el) => el.scrollLeft);
  await forward.click();
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
  await expect(page.locator('[data-strip-arrow="start"]').first()).toBeEnabled();

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/ehr-panel-paged.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("ehr-panel-paged.png", { fullPage: true });
  }
});
