import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { expectKeyless, KEY_MARKERS, wireText } from "./bytes";

// #267: the pages someone lands on after a bad link. The invite page resolves its token with the
// service role and sign-in reads the session in the proxy, so this needs the local Supabase stack
// like auth.spec.ts.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const NOT_FOUND_HEADING = "This page does not exist.";
/** A path nothing in the app will ever serve. */
const UNKNOWN_PATH = "/no-such-page-267";

/**
 * Words only the multiple choice gallery fixture holds: its general rationale, and its stem. The
 * control below proves they reach a response when a page does render a fixture.
 */
const FIXTURE_TEXT = [
  "Rapid weight gain with orthopnea suggests fluid overload",
  "reports gaining 2.3 kg (5 lb) in two days",
];

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/${name}.png`,
    fullPage: true,
  });
}

test("an unknown path answers 404 with the designed page, focused on its heading", async ({
  page,
}, testInfo) => {
  const response = await page.goto(UNKNOWN_PATH);
  expect(response?.status()).toBe(404);

  const heading = page.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING, exact: true });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page).toHaveTitle(/Page not found/);

  // Real links: Tab reaches them, and they go where they say.
  const home = page.getByRole("link", { name: "Go to the home page", exact: true });
  const signIn = page.getByRole("link", { name: "Sign in", exact: true });
  await expect(home).toHaveAttribute("href", "/");
  await expect(signIn).toHaveAttribute("href", "/sign-in");
  await page.keyboard.press("Tab");
  await expect(home).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(signIn).toBeFocused();

  await expectNoAxeViolations(page);
  await capture(page, testInfo, "not-found");

  await signIn.press("Enter");
  await expect(page).toHaveURL(/\/sign-in$/);
});

/**
 * The #146 lesson: a 404 status is not a boundary, only the bytes are. The gallery is open in this
 * job (VERCEL_ENV is unset), so a gallery item page is the control: it must carry the fixture and
 * its key, which proves the grep can match. Then two 404s must carry neither: an unknown path, and
 * a `notFound()` thrown inside the gallery segment itself, the one place a fixture sits one render
 * away from a 404.
 */
test("a 404 body carries no item data or keys, against a gallery page that does", async ({
  request,
}) => {
  const control = await request.get("/gallery/items/multiple_choice");
  expect(control.status()).toBe(200);
  const controlBytes = wireText(await control.text());
  for (const text of FIXTURE_TEXT) expect(controlBytes).toContain(text);
  expect(controlBytes).toContain("correctOptionId");

  for (const path of [UNKNOWN_PATH, "/gallery/items/not-an-item-type"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    const bytes = wireText(await response.text());
    expect(bytes, path).toContain(NOT_FOUND_HEADING);
    expectKeyless(bytes, FIXTURE_TEXT, KEY_MARKERS);
    expect(bytes, path).not.toContain("rationale");
  }
});

test("an invite link that does not work says to ask the instructor for a new one", async ({
  browser,
}, testInfo) => {
  // A browser with no session, as a student opening an old link would have.
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/c/zzzzzzzzzzzzzzzzzzzzzzzzzzzz0267");

  const heading = page.getByRole("heading", {
    level: 1,
    name: "This invite link does not work",
    exact: true,
  });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(
    page.getByText("Ask your instructor for a new link.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute(
    "href",
    "/sign-in",
  );

  await expectNoAxeViolations(page);
  await capture(page, testInfo, "invite-unavailable");
  await context.close();
});

test("an expired sign-in link lands on the form, ready to send a new one", async ({
  page,
}, testInfo) => {
  await page.goto("/sign-in?error=link");

  const heading = page.getByRole("heading", {
    level: 1,
    name: "Get a new sign-in link",
    exact: true,
  });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  // Next's route announcer is also role="alert", so match the alert by its message.
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "That sign-in link has expired or was already used." }),
  ).toHaveText(
    "That sign-in link has expired or was already used. Enter your email to get a new one.",
  );
  const field = page.getByRole("textbox", { name: "Email address", exact: true });
  await expect(field).toBeEditable();
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link", exact: true }),
  ).toBeEnabled();

  // The next Tab from the heading is the email field: the form is the page's next step.
  await page.keyboard.press("Tab");
  await expect(field).toBeFocused();

  await expectNoAxeViolations(page);
  await capture(page, testInfo, "sign-in-expired-link");
});
