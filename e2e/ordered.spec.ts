import { expect, test, type Page } from "@playwright/test";

// jsdom cannot drive dnd-kit sorting, so the grip drag and touch buttons are checked here.

async function openOrdered(page: Page) {
  await page.goto("/gallery/items/ordered_response");
  await page.locator('[data-hydrated="true"]').waitFor();
  return page.getByRole("list", { name: "Steps in order" }).getByRole("listitem");
}

test("a step drags into a new place by its grip", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "mouse drag is a desktop interaction");
  const rows = await openOrdered(page);
  const moved = await rows.nth(0).getAttribute("data-label");
  // The grip is the row's first hidden-from-assistive-tech element; it is pointer only.
  const grip = await rows.nth(0).locator('span[aria-hidden="true"]').first().boundingBox();
  const target = await rows.nth(2).boundingBox();
  if (!grip || !target) throw new Error("rows not laid out");

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 10, { steps: 4 });
  await page.mouse.move(grip.x + grip.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(rows.nth(2)).toHaveAttribute("data-label", moved!);
});

test("a step moves with the buttons on a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-375", "touch buttons are the phone path");
  const rows = await openOrdered(page);
  const moved = await rows.nth(0).getAttribute("data-label");

  await page.getByRole("button", { name: `Move "${moved}" down` }).tap();

  await expect(rows.nth(1)).toHaveAttribute("data-label", moved!);
});
