import { expect, test, type Locator, type Page } from "@playwright/test";

// jsdom cannot drive dnd-kit, so real pointer drag and touch tap-to-place are checked here.

const SABA = "a short-acting beta agonist";

async function openCloze(page: Page) {
  await page.goto("/gallery/items/dragdrop_cloze");
  await page.locator('[data-hydrated="true"]').waitFor();
}

const bankWord = (page: Page, label: string) =>
  page.getByRole("group", { name: "Word bank" }).getByRole("button", { name: label });

async function drag(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("word or blank not laid out");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  // Move in steps so dnd-kit passes its 6px activation distance and tracks the pointer.
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

test.describe("mouse drag", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "mouse drag is a desktop interaction");
  });

  test("a word drags into a blank and leaves the bank", async ({ page }) => {
    await openCloze(page);
    await drag(
      page,
      bankWord(page, SABA),
      page.getByRole("button", { name: "Blank 1 of 2, empty" }),
    );

    await expect(page.getByRole("button", { name: `Blank 1 of 2: ${SABA}` })).toBeVisible();
    await expect(bankWord(page, SABA)).toHaveCount(0);
  });

  test("releasing a drag does not leave a reusable word selected", async ({ page }) => {
    await openCloze(page);
    await page.getByRole("radio", { name: "Edge case" }).click();
    await drag(
      page,
      bankWord(page, "60"),
      page.getByRole("button", { name: "Blank 1 of 2, empty" }),
    );

    await expect(page.getByRole("button", { name: "Blank 1 of 2: 60" })).toBeVisible();
    await expect(bankWord(page, "60")).toHaveAttribute("aria-pressed", "false");
  });
});

test("a word is placed by tapping it, then a blank", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-375", "tap-to-place is the touch path");
  await openCloze(page);

  await bankWord(page, SABA).tap();
  await page.getByRole("button", { name: "Blank 1 of 2, empty" }).tap();

  await expect(page.getByRole("button", { name: `Blank 1 of 2: ${SABA}` })).toBeVisible();
});
