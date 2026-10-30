import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// #522: pricing, the terms, the privacy policy and the site footer are public and need no stack,
// so this runs against every preview (e2e.yml) as well as in the auth e2e job. Screens go to
// test-results/screenshots at 375, 768 and 1280, as the landing and help pages' do.

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

const PAGES = [
  { path: "/pricing", heading: "One price for the whole workspace.", title: "Pricing · LeaRN" },
  { path: "/terms", heading: "Terms of Service", title: "Terms of Service · LeaRN" },
  { path: "/privacy", heading: "Privacy Policy", title: "Privacy Policy · LeaRN" },
] as const;

for (const { path, heading, title } of PAGES) {
  test(`${path} loads signed out and passes axe`, async ({ page }, testInfo) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    // Not bounced to sign-in.
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page).toHaveTitle(title);
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();

    const site = page.getByRole("navigation", { name: "Site" });
    await expect(site.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    await expect(site.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    await expect(page.getByRole("contentinfo")).toContainText(
      "Every patient shown in LeaRN is fictional.",
    );

    await expectNoAxeViolations(page);
    await expectNoSidewaysScroll(page);
    await page.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}/${path.slice(1)}.png`,
      fullPage: true,
    });
  });
}

test("pricing offers a visitor an account", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText("a month per workspace", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Create an account", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "/pricing");
});

test("the landing page's footer links every public page and passes axe", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.scrollIntoViewIfNeeded();
  const nav = footer.getByRole("navigation", { name: "Footer" });
  for (const [name, href] of [
    ["Pricing", "/pricing"],
    ["Help", "/help"],
    ["Terms", "/terms"],
    ["Privacy", "/privacy"],
    ["Contact", "mailto:support@learnursing.app"],
  ]) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(footer).toContainText(`© ${new Date().getFullYear()} LeaRN`);
  await expectNoAxeViolations(page);
  await expectNoSidewaysScroll(page);
  await footer.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/landing-footer.png`,
  });
});
