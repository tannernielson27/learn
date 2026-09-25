import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ITEM_TYPES, ITEM_TYPE_LABELS } from "../src/lib/ngn/labels";
import { signInAsNewAuthor } from "./signIn";

// #269: the help pages are public and static. The signed-out tests need no stack, so they run
// against every preview (e2e.yml) as well as in the auth e2e job; the author-nav test needs the
// local stack.

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/** Every image on the page has alt text, explicit dimensions, and actually loaded. */
async function expectImagesDescribedAndLoaded(page: Page): Promise<void> {
  const images = page.locator("main img");
  const count = await images.count();
  for (let index = 0; index < count; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("alt", /\S{3,}/);
    await expect(image).toHaveAttribute("width", /^\d+$/);
    await expect(image).toHaveAttribute("height", /^\d+$/);
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
  }
}

const PAGES = [
  { path: "/help", heading: "Using LeaRN" },
  { path: "/help/instructor", heading: "Instructor guide" },
  { path: "/help/items", heading: "Item guide" },
] as const;

for (const { path, heading } of PAGES) {
  test(`${path} loads signed out and passes axe`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    // Not bounced to sign-in: help needs no session.
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    await expectImagesDescribedAndLoaded(page);
    await expectNoAxeViolations(page);
  });
}

test("the item guide has a section for every item type", async ({ page }, testInfo) => {
  await page.goto("/help/items");
  for (const type of ITEM_TYPES) {
    await expect(
      page.getByRole("heading", { level: 3, name: ITEM_TYPE_LABELS[type], exact: true }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/help-items.png`,
    fullPage: true,
  });
});

// The demo step: from help, open the item guide and find how a drop-down rationale is scored.
test("a reader finds how a drop-down rationale item is scored", async ({ page }) => {
  await page.goto("/help");
  await page.getByRole("link", { name: "Item-writing guide", exact: true }).click();
  await expect(page).toHaveURL(/\/help\/items$/);
  await page
    .getByRole("navigation", { name: "On this page" })
    .getByRole("link", { name: "Drop-Down Rationale", exact: true })
    .click();
  await expect(page).toHaveURL(/#dropdown-rationale$/);
  const section = page.locator("section#dropdown-rationale");
  await expect(section).toBeInViewport();
  await expect(section).toContainText("Dyad: 1 point only if both are correct.");
  await expect(section).toContainText("Anchor wrong: 0.");
});

test("the author nav links to help", async ({ page, request }, testInfo) => {
  test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");
  await signInAsNewAuthor(page, request, `help-${testInfo.project.name}`);
  await page
    .getByRole("navigation", { name: "Author" })
    .getByRole("link", { name: "Help", exact: true })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Using LeaRN", exact: true }),
  ).toBeVisible();
});
