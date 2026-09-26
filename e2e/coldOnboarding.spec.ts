import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import { latestSignInLink } from "./mailbox";
import { createInstructorInEmptyOrg, selectAsAdmin } from "./signIn";

// #274: Demo 12, rehearsed by a machine. An outside instructor onboards cold and runs a class
// without help: the landing page, sign in, Get started, the sample, a class, a student through the
// invite, and a live session a phone answers. docs/sprints/S11-rehearsal.md is the same walk for a
// person, step for step. Needs the local Supabase stack (auth, Mailpit, Realtime) and a build
// pointed at it, like auth.spec.ts. A live session, never a take-home window, so it waits out no
// real time (S11 kickoff decision 9).
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const HEADLINE = "Live learning for the Next Generation NCLEX.";
/** Two groups of three from the unambiguous alphabet, exactly as the console shows it. */
const CODE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{3} [23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{3}$/;
/** The sample's multiple-choice item, which the phone answers, and its keyed option. */
const MC = FIXTURES.multiple_choice.canonical;
// The fixture always has option A; the fallback only satisfies the index type.
const MC_OPTION = MC.content.options[0]?.label ?? "";
const PHONE_NAME = "Ada Brennan";

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/** Each step's picture, for the demo doc: test-results/screenshots/<project>/demo12-<step>.png. */
async function shoot(page: Page, testInfo: TestInfo, step: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/demo12-${step}.png`,
    fullPage: true,
  });
}

/** A second browser at this project's size: a student's phone is not the instructor's tab. */
async function phoneContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  const { viewport, isMobile, hasTouch, baseURL } = testInfo.project.use;
  return browser.newContext({ viewport, isMobile, hasTouch, baseURL, reducedMotion: "reduce" });
}

/**
 * Which "Go to item" button holds the sample's multiple-choice item. The sample's rows are written
 * in one transaction, so they share a `created_at` and the room's order falls to their ids: it is
 * not the same twice. A person answers whatever is on screen; a script has to know what it is
 * answering, so this reads the room's item order and the strip does the rest, as a host would.
 */
async function multipleChoicePosition(
  request: APIRequestContext,
  sessionId: string,
  bankId: string,
): Promise<number> {
  const [session] = await selectAsAdmin<{ item_set: string[] }>(
    request,
    "sessions",
    `select=item_set&id=eq.${sessionId}`,
  );
  const candidates = await selectAsAdmin<{
    id: string;
    // The row keeps the item as learn wrote it: the options sit under `content.content`.
    content: { content?: { options?: { label: string }[] } };
  }>(request, "items", `select=id,content&bank_id=eq.${bankId}&type=eq.multiple_choice`);
  if (!session) throw new Error(`no session row for ${sessionId}`);
  const item = candidates.find((row) => row.content.content?.options?.[0]?.label === MC_OPTION);
  if (!item) {
    throw new Error(`no multiple-choice item in bank ${bankId} starts with "${MC_OPTION}"`);
  }
  const position = session.item_set.indexOf(item.id) + 1;
  if (position < 1) throw new Error("the sample's multiple-choice item is not in this session");
  return position;
}

/** The last path segment of a page's URL, an id; refuses a URL that ends without one. */
function idFrom(url: string): string {
  const id = new URL(url).pathname.split("/").at(-1);
  if (!id) throw new Error(`no id at the end of ${url}`);
  return id;
}

test("an outside instructor onboards cold and runs a live session a phone answers", async ({
  browser,
  page,
  request,
}, testInfo) => {
  // Two sign-ins by email, an import, a class and a live round across three browsers.
  test.slow();
  const project = testInfo.project.name;

  // 1. The operator adds the instructor (docs/05 §7.6), here through the admin API.
  const { email } = await createInstructorInEmptyOrg(request, `demo12-${project}`);

  // 2. The instructor finds Sign in on the landing page and signs in from the emailed link.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE, exact: true })).toBeVisible();
  await shoot(page, testInfo, "1-landing");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sign in", exact: true })).toBeVisible();
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email", exact: true })).toBeVisible();
  await shoot(page, testInfo, "2-check-email");
  await page.goto(await latestSignInLink(request, email, since));
  await expect(page).toHaveURL(/\/author$/);

  // 3. Get started shows three steps, none done; the sample comes in published.
  const checklist = page.getByRole("region", { name: "Get started", exact: true });
  await expect(checklist).toBeVisible();
  await expect(checklist.getByText("0 of 3 done", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await shoot(page, testInfo, "3-get-started");
  await checklist.getByRole("button", { name: "Import the sample bank", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sample bank", exact: true }),
  ).toBeVisible();
  const bankUrl = page.url();
  const bankId = idFrom(bankUrl);
  await shoot(page, testInfo, "4-sample-bank");

  // ...then a class from the checklist's own link, and its invite link copied.
  await page.goto("/author");
  await expect(checklist.getByText("1 of 3 done", { exact: true })).toBeVisible();
  await checklist.getByRole("link", { name: "Go to your classes", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes$/);
  const className = `NUR 310 ${project} ${Date.now() % 100_000}`;
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(className);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  const classUrl = page.url();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy invite link", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied." })).toBeVisible();
  const invite = await page.evaluate(() => navigator.clipboard.readText());
  await expect(page.getByRole("textbox", { name: "Invite link", exact: true })).toHaveValue(invite);
  await expectNoAxeViolations(page);
  await shoot(page, testInfo, "5-class-invite");

  // 4. A student opens the invite on their own phone, signs in by email, lands on their home.
  const studentPhone = await phoneContext(browser, testInfo);
  const student = await studentPhone.newPage();
  await student.goto(invite);
  const studentEmail = `student-demo12-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const studentSince = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(studentEmail);
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await expect(
    student.getByRole("heading", { name: "Check your email", exact: true }),
  ).toBeVisible();
  await student.goto(await latestSignInLink(request, studentEmail, studentSince));
  await expect(student).toHaveURL(/\/learn$/);
  await expect(student.getByRole("list", { name: "Your classes", exact: true })).toContainText(
    className,
  );
  await expectNoAxeViolations(student);
  await shoot(student, testInfo, "6-student-home");
  await studentPhone.close();

  // The instructor sees them on the roster.
  await page.goto(classUrl);
  await expect(page.getByRole("list", { name: "Roster", exact: true })).toContainText(studentEmail);

  // 5. A live session from the sample bank; a phone joins by code from the landing page.
  await page.goto(bankUrl);
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  const sessionId = idFrom(page.url());
  const shownCode = page.getByRole("region", { name: "Join code", exact: true }).getByText(CODE);
  await expect(shownCode).toBeVisible();
  const code = await shownCode.innerText();
  await expect(
    page.getByText(
      "Nobody has joined yet. Read the code out, or leave the QR code on the screen.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();

  const liveContext = await phoneContext(browser, testInfo);
  const phone = await liveContext.newPage();
  await phone.goto("/");
  await phone.getByRole("link", { name: "Join a live session", exact: true }).click();
  await phone.getByRole("textbox", { name: "Session code", exact: true }).fill(code);
  await phone.getByRole("textbox", { name: "Display name", exact: true }).fill(PHONE_NAME);
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  await expect(phone.getByText("You are in.", { exact: true })).toBeVisible();

  // Presence arrives on the console with no reload.
  await expect(page.getByText(PHONE_NAME, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 phone connected", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await shoot(page, testInfo, "7-lobby");

  await page.getByRole("button", { name: "Start session", exact: true }).click();
  const position = await multipleChoicePosition(request, sessionId, bankId);
  const goTo = page.getByRole("button", { name: `Go to item ${position}`, exact: true });
  if (position > 1) await goTo.click();
  await expect(goTo).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("0 of 1 answered", { exact: true })).toBeVisible({ timeout: 15_000 });

  // The phone answers the item on its screen.
  // The player letters each option, so its accessible name is "A" and the label.
  const option = phone
    .getByRole("radiogroup", { name: "Options", exact: true })
    .getByRole("radio", { name: `A ${MC_OPTION}`, exact: true });
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  await phone.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    phone.getByText("Answer sent. Your instructor will show the answer at the front.", {
      exact: true,
    }),
  ).toBeVisible();
  await expectNoAxeViolations(phone);
  await shoot(phone, testInfo, "8-phone-answered");

  // The instructor watches the count move, and how the room answered.
  await expect(page.getByText("1 of 1 answered", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page
      .getByRole("list", { name: "Options", exact: true })
      .getByRole("listitem")
      .filter({ hasText: MC_OPTION }),
  ).toContainText("1 of 1 · 100%", { timeout: 15_000 });
  await expectNoAxeViolations(page);
  await shoot(page, testInfo, "9-console-result");

  // The reveal puts the phone's own mark on it; then the room ends.
  await page.getByRole("button", { name: "Show answer", exact: true }).click();
  await expect(phone.getByRole("complementary", { name: "Score", exact: true })).toContainText(
    "1 / 1",
    { timeout: 15_000 },
  );
  await shoot(phone, testInfo, "10-phone-score");
  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(phone.getByText("This session has ended.", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await liveContext.close();

  // Every Get started step is done, so the author home no longer shows the checklist.
  await page.goto("/author");
  await expect(
    page.getByRole("heading", { level: 1, name: "Item banks", exact: true }),
  ).toBeVisible();
  await expect(checklist).toHaveCount(0);
  await shoot(page, testInfo, "11-author-home-done");
});
