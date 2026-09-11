import { expect, test, type Page } from "@playwright/test";
import { drag } from "./drag";

// jsdom cannot drive dnd-kit, so real drags and touch tap-to-place are checked here.

const ACTIONS = "Actions to Take";
const ECG = "Obtain a 12-lead ECG within 10 minutes";

async function openBowtie(page: Page) {
  await page.goto("/gallery/items/bowtie");
  await page.locator('[data-hydrated="true"]').waitFor();
}

const choice = (page: Page, column: string, label: string) =>
  page.getByRole("group", { name: `${column} choices` }).getByRole("button", { name: label });

test.describe("mouse drag", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "mouse drag is a desktop interaction");
  });

  test("a choice drags into a slot in its own column", async ({ page }) => {
    await openBowtie(page);
    await drag(
      page,
      choice(page, ACTIONS, ECG),
      page.getByRole("button", { name: `${ACTIONS} 1 of 2, empty` }),
    );

    await expect(page.getByRole("button", { name: `${ACTIONS} 1 of 2: ${ECG}` })).toBeVisible();
    await expect(choice(page, ACTIONS, ECG)).toHaveCount(0);
  });

  test("a choice dropped on another column is refused", async ({ page }) => {
    await openBowtie(page);
    await drag(
      page,
      choice(page, ACTIONS, ECG),
      page.getByRole("button", { name: "Potential Condition, empty" }),
    );

    await expect(page.getByRole("button", { name: "Potential Condition, empty" })).toBeVisible();
    await expect(choice(page, ACTIONS, ECG)).toBeVisible();
  });
});

test("a choice is placed by tapping it, then a slot", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-375", "tap-to-place is the touch path");
  await openBowtie(page);

  await choice(page, ACTIONS, ECG).tap();
  await page.getByRole("button", { name: `${ACTIONS} 1 of 2, empty` }).tap();

  await expect(page.getByRole("button", { name: `${ACTIONS} 1 of 2: ${ECG}` })).toBeVisible();
});
