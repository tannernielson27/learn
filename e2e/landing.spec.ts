import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { bytesOf, expectKeyless } from "./bytes";
import { signInAsNewAuthor } from "./signIn";

// #264. The signed-out half needs nothing but the app, so it also runs in the preview e2e job;
// the signed-in half needs the local stack and runs in the auth-e2e job with E2E_AUTH=1.

const HEADLINE = "Next Generation NCLEX quizzes, live in class.";

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

test("a visitor learns what LeaRN is and finds the trial, Sign in and the join code", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE, exact: true })).toBeVisible();
  await expect(page).toHaveTitle("LeaRN: live learning for the Next Generation NCLEX");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /For nursing teachers and their students\.$/,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /Next Generation NCLEX/,
  );

  // #563: the free trial first, with Sign in beside it; the price under them.
  const hero = page.getByRole("region", { name: HEADLINE });
  await expect(
    hero.getByRole("link", { name: "Start your free trial", exact: true }),
  ).toHaveAttribute("href", "/sign-up");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  await expect(hero).toContainText("7 days free, then $39.99 a month per workspace.");

  // The student's door is on the page, above the fold on a phone.
  const code = page.getByRole("textbox", { name: "Join code", exact: true });
  await expect(code).toBeInViewport();
  await expect(page.getByRole("button", { name: "Join", exact: true })).toBeInViewport();
  await expect(page.getByText("In class now? No account needed.", { exact: true })).toBeVisible();

  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Who it is for",
    "How a live session works",
    "Every Next Generation NCLEX format",
    "Assignments and practice",
    "Pricing",
    "Bring your next class into a live session.",
  ]);
  await expect(page.getByTestId("answer-count")).toHaveText(/18\s*of 24 answered/);
  await expect(page.locator('a[href*="gallery"]')).toHaveCount(0);

  // No sideways scroll at any width the project runs at.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
  expect(await layoutShift(page)).toBeLessThan(0.1);

  await page.getByTestId("demo-projector").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-motion]")).toHaveAttribute("data-motion", /played|still/);
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/landing.png`,
    fullPage: true,
  });

  // The picture is a gallery question read through the projector's door: no key, no rationale.
  // The control is the question itself: the same read of the same bytes finds what is there.
  const bytes = await bytesOf(page.context(), "/");
  expect(bytes).toContain(HEADLINE);
  expect(bytes).toContain("Which action should the nurse take first?");
  expectKeyless(bytes, [
    "Rapid weight gain with orthopnea suggests fluid overload.",
    "Assessment comes first: lung sounds and saturation",
    "opt_a",
  ]);

  await code.fill("v96 rn8");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page).toHaveURL(/\/join\/V96RN8$/);
  await expect(page.getByRole("textbox", { name: "Join code", exact: true })).toHaveValue("V96RN8");

  await page.goto("/");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Enter the six-character join code on the screen.",
  );

  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in", exact: true })).toBeVisible();

  await page.goto("/");
  await hero.getByRole("link", { name: "Start your free trial", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Create an account", exact: true }),
  ).toBeVisible();
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
