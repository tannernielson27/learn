import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { bytesOf, expectKeyless } from "./bytes";
import { signInAsNewAuthor } from "./signIn";

// #264. The signed-out half needs nothing but the app, so it also runs in the preview e2e job;
// the signed-in half needs the local stack and runs in the auth-e2e job with E2E_AUTH=1.

const HEADLINE = "Live learning for the Next Generation NCLEX.";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

/** Cumulative layout shift so far, from the buffered `layout-shift` entries. */
async function layoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          })[]) {
            if (!entry.hadRecentInput) total += entry.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
        // Buffered entries arrive in the first callback; give it a frame.
        requestAnimationFrame(() => setTimeout(() => resolve(total), 0));
      }),
  );
}

test("a visitor learns what LeaRN is and finds Sign in and Join, and no gallery", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE, exact: true })).toBeVisible();
  await expect(page).toHaveTitle("LeaRN: live learning for the Next Generation NCLEX");

  await expect(
    page.getByRole("link", { name: "Join a live session", exact: true }),
  ).toHaveAttribute("href", "/join");
  await expect(page.locator('a[href*="gallery"]')).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /Next Generation NCLEX/,
  );

  // The sample is a labeled picture, sized in the markup, and it loaded.
  const figure = page.getByRole("figure");
  await expect(figure.getByText("Sample", { exact: true })).toBeVisible();
  const sample = figure.getByRole("img");
  await sample.scrollIntoViewIfNeeded();
  await expect(sample).toHaveAttribute("width", "929");
  await expect(sample).toHaveAttribute("height", "634");
  await expect
    .poll(() => sample.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  expect(await layoutShift(page)).toBeLessThan(0.1);

  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/landing.png`,
    fullPage: true,
  });

  // No item renders here, so nothing key-shaped can be on the wire. The control is the headline:
  // the same read of the same bytes does find what the page really carries.
  const bytes = await bytesOf(page.context(), "/");
  expect(bytes).toContain(HEADLINE);
  expectKeyless(bytes, []);

  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in", exact: true })).toBeVisible();
});

test("a signed-in instructor is offered their item banks instead of Sign in", async ({
  page,
  request,
}, testInfo) => {
  test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");
  await signInAsNewAuthor(page, request, `landing-${testInfo.project.name}`);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  const home = page.getByRole("link", { name: "Go to your item banks", exact: true });
  await expect(home).toHaveAttribute("href", "/author");
  await expectNoAxeViolations(page);

  await home.click();
  await expect(page).toHaveURL(/\/author$/);
});
