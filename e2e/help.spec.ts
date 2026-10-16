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
  { path: "/help", heading: "Using LeaRN", shot: "help" },
  { path: "/help/instructor", heading: "Teacher guide", shot: "help-teacher" },
  { path: "/help/items", heading: "Question guide", shot: null },
] as const;

for (const { path, heading, shot } of PAGES) {
  test(`${path} loads signed out and passes axe`, async ({ page }, testInfo) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    // Not bounced to sign-in: help needs no session.
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    await expectImagesDescribedAndLoaded(page);
    await expectNoAxeViolations(page);
    // Nothing on a help page is wider than the phone it is read on.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (shot) {
      await page.screenshot({
        path: `test-results/screenshots/${testInfo.project.name}/${shot}.png`,
        fullPage: true,
      });
    }
  });
}

// #416: other screens link into the teacher guide, so its anchors are part of what it promises.
test("the teacher guide's contents list goes to each section", async ({ page }) => {
  await page.goto("/help/instructor");
  const contents = page.getByRole("navigation", { name: "On this page", exact: true });
  await expect(contents.getByRole("link")).toHaveText([
    "Sign up and sign in",
    "Create or import a quiz",
    "Import questions with AI",
    "Write questions",
    "Create a class and invite students",
    "Assign a quiz",
    "Start a live session",
    "Read the reports",
    "Share a quiz for practice",
  ]);
  await contents.getByRole("link", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/#live$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "Start a live session", exact: true }),
  ).toBeInViewport();
  // A topic inside a section has an anchor of its own.
  await page.goto("/help/instructor#publish");
  await expect(
    page.getByRole("heading", { level: 3, name: "Drafts and publishing", exact: true }),
  ).toBeInViewport();
});

test("the question guide has a section for every question format", async ({ page }, testInfo) => {
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

// #349: the upload page links here, so the anchor is part of what the guide promises.
test("the teacher guide explains AI import, with its review screen", async ({ page }) => {
  await page.goto("/help/instructor#ai-import");
  await expect(
    page.getByRole("heading", { level: 2, name: "Import questions with AI", exact: true }),
  ).toBeInViewport();
  const section = page.locator("section#ai-import");
  await expect(section).toContainText("It never writes an answer or a rationale.");
  await expect(section.getByRole("img")).toBeVisible();
});

// The demo step: from help, open the question guide and find how a drop-down rationale is scored.
test("a reader finds how a drop-down rationale question is scored", async ({ page }) => {
  await page.goto("/help");
  // The page's own list, not the help navigation above it, which names the same guide.
  await page.getByRole("main").getByRole("link", { name: "Question guide", exact: true }).click();
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

test("the landing page's footer links to help", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Footer" })
    .getByRole("link", { name: "Help", exact: true })
    .click();
  await expect(page).toHaveURL(/\/help$/);
});

test("the author nav links to help", async ({ page, request }, testInfo) => {
  test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");
  await signInAsNewAuthor(page, request, `help-${testInfo.project.name}`);
  await page
    .getByRole("navigation", { name: "Help and account" })
    .getByRole("link", { name: "Help", exact: true })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Using LeaRN", exact: true }),
  ).toBeVisible();
});
