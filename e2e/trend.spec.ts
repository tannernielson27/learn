import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ready = async (page: Page) => {
  await page.goto("/gallery/trend");
  await expect(page.getByRole("heading", { level: 1, name: "Trend item" })).toBeVisible();
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

/** At 1024px and up the record is already open; below that it is behind the chip. */
const openRecord = async (page: Page, project: string) => {
  if (project === "desktop-1280") return;
  await page.getByRole("button", { name: "Patient record" }).click();
};

test("trend item: screenshot and accessibility", async ({ page }, testInfo) => {
  await ready(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/trend.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("trend.png", { fullPage: true });
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
});

test("stepping through the times shows one section changing", async ({ page }, testInfo) => {
  await ready(page);
  await openRecord(page, testInfo.project.name);

  await page.getByRole("tab", { name: "Vital Signs" }).click();
  const panel = page.getByRole("tabpanel", { name: "Vital Signs" });
  const sat = panel.getByRole("row").filter({ hasText: "SpO2" });

  // The same section, read at three times: the oxygen requirement climbs as the saturation falls.
  await expect(sat).toContainText("94");
  await page.getByRole("radio", { name: "1200" }).click();
  await expect(page.getByRole("tab", { selected: true })).toHaveText("Vital Signs");
  await expect(sat).toContainText("91");
  await page.getByRole("radio", { name: "1600" }).click();
  await expect(sat).toContainText("89");
  await expect(sat).toContainText("face mask");

  // Labs were not drawn at 0800, so that section is absent then rather than empty.
  await expect(page.getByRole("tab", { name: "Lab Results" })).toBeVisible();
  await page.getByRole("radio", { name: "0800" }).click();
  await expect(page.getByRole("tab", { name: "Lab Results" })).toHaveCount(0);
});

test("the chosen time survives closing the record on a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-375", "the record only closes on a phone");
  await ready(page);

  const chip = page.getByRole("button", { name: "Patient record" });
  await chip.tap();
  await page.getByRole("radio", { name: "1600" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await chip.tap();
  await expect(page.getByRole("radio", { name: "1600" })).toBeChecked();
});

test("the trend item answers and scores like any other", async ({ page }, testInfo) => {
  await ready(page);

  // The matrix is a grid at 768px and up and one card per row below, and the two name their
  // radios differently: the grid by row and column, the card by column alone inside a named group.
  const pick = async (row: string, column: string) => {
    const card = page.getByRole("group", { name: row });
    if ((await card.count()) > 0) await card.getByRole("radio", { name: column }).click();
    else await page.getByRole("radio", { name: new RegExp(`${row}.*${column}`) }).click();
  };

  // The record says every finding but the temperature has declined over the shift.
  for (const row of ["Peripheral perfusion", "Blood pressure", "Oxygenation"]) {
    await pick(row, "Declined");
  }
  await pick("Temperature", "Improved");

  const submit = page.getByRole("button", { name: "Submit" });
  await expect(submit).toBeEnabled();
  await submit.click();

  const score = page.getByRole("complementary", { name: "Score" });
  await expect(score).toContainText("4");
  await expect(score).toContainText("/ 4");

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/trend-feedback.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("trend-feedback.png", { fullPage: true });
  }
});
