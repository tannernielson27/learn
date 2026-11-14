import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { bytesOf, expectKeyless, KEY_MARKERS } from "./bytes";
import { signInAsNewAuthor } from "./signIn";

// The landing page's drawing of a live session is the gallery's multiple choice fixture (#563).
const DEMO_STEM = "Which action should the nurse take first?";
const DEMO_RATIONALE = [
  "Rapid weight gain with orthopnea suggests fluid overload.",
  "More fluid worsens an already overloaded circulation.",
] as const;

// #264. The signed-out half needs nothing but the app, so it also runs in the preview e2e job;
// the signed-in half needs the local stack and runs in the auth-e2e job with E2E_AUTH=1.

const HEADLINE = "Next Generation NCLEX quizzes, live in class.";

/** The count where it settles: 18, with the earlier 15 gone and hidden from screen readers. */
async function expectSettledCount(count: Locator) {
  await expect(count.locator("[data-demo-step]")).toHaveText("18");
  await expect(count.locator("[data-demo-before]")).toHaveAttribute("aria-hidden", "true");
  await expect(count.locator("[data-demo-before]")).toHaveCSS("opacity", "0");
  await expect(count).toContainText("of 24 answered");
}

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

test("a visitor learns what LeaRN is and finds the free trial, Sign in and Join, and no gallery", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE, exact: true })).toBeVisible();
  await expect(page).toHaveTitle("LeaRN: live learning for the Next Generation NCLEX");

  // #366: sign-up is open, so the free trial (#563) is the first thing offered, with Sign in beside it.
  const main = page.getByRole("main");
  await expect(
    main.getByRole("link", { name: "Start your free trial", exact: true }).first(),
  ).toHaveAttribute("href", "/sign-up");
  await expect(main.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  // #563: four numbered sections under the headline.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "How a live session works",
    "Every Next Generation NCLEX format",
    "Assignments and practice",
    "Pricing",
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

  // #563: the student's door is a form on the page, in the first screen of a phone.
  const join = page.getByRole("form", { name: "Join a live session" });
  await expect(join.getByRole("textbox", { name: "Join code", exact: true })).toBeInViewport();
  await expect(join.getByRole("button", { name: "Join", exact: true })).toBeInViewport();
  await expect(join).toContainText("In class now? No account needed.");

  // The drawing of a live session is HTML, finished once it has played, with the live count.
  const figure = page.getByRole("figure");
  await figure.scrollIntoViewIfNeeded();
  await expectSettledCount(figure.getByTestId("live-class-count"));
  expect(await layoutShift(page)).toBeLessThan(0.1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/landing.png`,
    fullPage: true,
  });

  // The drawing carries a fixture's question and nothing of its key or rationale. The control is
  // the question itself: the same read of the same bytes does find what the page really carries.
  const bytes = await bytesOf(page.context(), "/");
  expect(bytes).toContain(HEADLINE);
  expect(bytes).toContain(DEMO_STEM);
  expectKeyless(bytes, DEMO_RATIONALE, [...KEY_MARKERS, "correctOptionId", "opt_a"]);

  await main.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in", exact: true })).toBeVisible();

  await page.goto("/");
  await main.getByRole("link", { name: "Start your free trial", exact: true }).first().click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Create an account", exact: true }),
  ).toBeVisible();
});

// #563: the landing page's code goes to the join page for it, with or without JavaScript.
for (const javaScriptEnabled of [true, false]) {
  test(`a student types a join code on the landing page and lands on its join page (JavaScript ${javaScriptEnabled ? "on" : "off"})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled });
    const page = await context.newPage();
    try {
      await page.goto("/");
      const field = page.getByRole("textbox", { name: "Join code", exact: true });
      await field.fill("v96 rn8");
      await field.press("Enter");
      await expect(page).toHaveURL(/\/join\/V96RN8$/);
      // The join page reads who is signed in, so it needs the stack to draw its form.
      if (process.env.E2E_AUTH === "1") {
        await expect(page.getByRole("textbox", { name: "Join code", exact: true })).toHaveValue(
          "V96RN8",
        );
      }
      await page.goto("/");
      await page.getByRole("textbox", { name: "Join code", exact: true }).fill("nope");
      await page.getByRole("button", { name: "Join", exact: true }).click();
      const form = page.getByRole("form", { name: "Join a live session" });
      await expect(form.getByRole("alert")).toHaveText(
        "Enter the six-character join code on the screen.",
      );
      await expect(page).toHaveURL(/\/$/);
    } finally {
      await context.close();
    }
  });
}

test("the live session is the finished drawing under reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const play = page.getByTestId("live-class-play");
    await play.scrollIntoViewIfNeeded();
    await expect(play).not.toHaveAttribute("data-demo");
    await expectSettledCount(page.getByTestId("live-class-count"));
  } finally {
    await context.close();
  }
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
  const home = page.getByRole("link", { name: "Go to your quizzes", exact: true }).first();
  await expect(home).toHaveAttribute("href", "/author");
  await expectNoAxeViolations(page);

  await home.click();
  await expect(page).toHaveURL(/\/author$/);
});
