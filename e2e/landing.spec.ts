import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { bytesOf, expectKeyless } from "./bytes";
import { signInAsNewAuthor } from "./signIn";

// #264. The signed-out half needs nothing but the app, so it also runs in the preview e2e job;
// the signed-in half needs the local stack and runs in the auth-e2e job with E2E_AUTH=1.

const HEADLINE = "Next Generation NCLEX quizzes, live in your classroom.";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

/**
 * Cumulative layout shift so far, from the buffered `layout-shift` entries, read once the fonts
 * have settled. Entries still queued for the observer's callback when it resolves are collected
 * with `takeRecords`, so a callback that has not run yet cannot make the total read as zero.
 */
async function layoutShift(page: Page): Promise<number> {
  return page.evaluate(async () => {
    type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean };
    let total = 0;
    const add = (entries: PerformanceEntryList) => {
      for (const entry of entries as Shift[]) if (!entry.hadRecentInput) total += entry.value;
    };
    const observer = new PerformanceObserver((list) => add(list.getEntries()));
    observer.observe({ type: "layout-shift", buffered: true });
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 250));
    add(observer.takeRecords());
    observer.disconnect();
    return total;
  });
}

test("a visitor learns what LeaRN is, finds the free trial, Sign in and the join code", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE, exact: true })).toBeVisible();
  await expect(page).toHaveTitle("LeaRN: live learning for the Next Generation NCLEX");

  // #563: the free trial first (sign-up, #366), with Sign in beside it.
  const hero = page.getByRole("region", { name: HEADLINE, exact: true });
  await expect(
    hero.getByRole("link", { name: "Start your free trial", exact: true }),
  ).toHaveAttribute("href", "/sign-up");
  await expect(hero.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Join a live session",
    "One question on the screen, an answer from every phone.",
    "From a quiz to a reviewed answer, in one class.",
    "Every Next Generation NCLEX format, and six-step case studies.",
    "One price for the whole workspace.",
  ]);
  await expect(page.getByText(/invite-only/i)).toHaveCount(0);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /For nursing teachers and their students\.$/,
  );
  await expect(page.locator('a[href*="gallery"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /Next Generation NCLEX/,
  );

  // The student's door is above the fold on a phone, and the page never scrolls sideways.
  const join = page.getByRole("button", { name: "Join", exact: true });
  const box = await join.boundingBox();
  const viewport = page.viewportSize();
  if (testInfo.project.name.includes("375") || (viewport && viewport.width <= 375)) {
    expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 667);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );

  const specimen = page.getByRole("img", { name: /18 of 24 answered/ });
  await specimen.scrollIntoViewIfNeeded();
  await expect(specimen).toBeVisible();
  expect(await layoutShift(page)).toBeLessThan(0.1);

  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/landing.png`,
    fullPage: true,
  });

  // The specimen is drawn from a fixture that has a key; none of it may be on the wire. The control
  // is the stem: the same read of the same bytes does find what the page really carries.
  const bytes = await bytesOf(page.context(), "/");
  expect(bytes).toContain(HEADLINE);
  expect(bytes).toContain("Which action should the nurse take first?");
  expectKeyless(bytes, []);
  expect(bytes).not.toContain("correctOptionId");
  expect(bytes).not.toContain("opt_a");

  await hero.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in", exact: true })).toBeVisible();

  await page.goto("/");
  await hero.getByRole("link", { name: "Start your free trial", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Create an account", exact: true }),
  ).toBeVisible();
});

// #563: the landing page's join field goes where /join goes, with and without JavaScript.
test("a student types a join code on the landing page and lands on its join page", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "Join code", exact: true });
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("six-character join code");
  await expect(page).toHaveURL(/\/$/);

  await field.fill("v96 rn8");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/join\/V96RN8$/);
  await expect(page.getByRole("textbox", { name: "Join code", exact: true })).toHaveValue("V96RN8");

  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noScript.newPage();
  await plain.goto("/");
  await plain.getByRole("textbox", { name: "Join code", exact: true }).fill("v96-rn8");
  await plain.getByRole("button", { name: "Join", exact: true }).click();
  await expect(plain).toHaveURL(/\/join\/V96RN8$/);
  await plain.goto("/join?code=ABC");
  await expect(plain.getByRole("alert")).toContainText("six-character join code");
  await noScript.close();
});

test("a signed-in teacher is offered their quizzes instead of Sign in", async ({
  page,
  request,
}, testInfo) => {
  test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");
  await signInAsNewAuthor(page, request, `landing-${testInfo.project.name}`);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  const home = page.getByRole("link", { name: "Go to your quizzes", exact: true });
  await expect(home).toHaveAttribute("href", "/author");
  await expectNoAxeViolations(page);

  await home.click();
  await expect(page).toHaveURL(/\/author$/);
});
