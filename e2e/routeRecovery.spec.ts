import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fillMultipleChoice, publishOpenItem } from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack with Realtime, like liveSession.spec.ts.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

const STEM = "Which finding is expected?";
/** The httpOnly cookie a join sets (src/lib/live/participantToken.ts). */
const PARTICIPANT_COOKIE = "learn_participant";

async function participantCookie(context: BrowserContext): Promise<string | undefined> {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === PARTICIPANT_COOKIE)?.value;
}

/**
 * #164: a render error in the student room shows the room's own boundary, and Try again puts the
 * student back in the same room as the same participant.
 *
 * The error is forced from the outside, with no hook in the app: the phone's first view of the
 * running room is answered with a `state` of null, which is what a malformed response from
 * `/api/live/view` would look like, and `StudentRoom` cannot render it. Every later request goes
 * through untouched, so the retry meets a healthy server — the shape of a transient failure.
 */
test("a student whose room fails to render rejoins it, as the same participant, on Try again", async ({
  browser,
  page,
  request,
}, testInfo) => {
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);

  const bankName = `Recovery ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("link", { name: "New item", exact: true }).click();
  await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
  await fillMultipleChoice(
    page,
    STEM,
    ["Bradycardia", "Tachycardia", "Hypotension", "Bounding pulses"],
    1,
  );
  await publishOpenItem(page);
  await page.getByRole("link", { name: "Back to bank", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");

  // A browser of its own, so the participant cookie is this phone's alone.
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const phone = await browser.newContext({
    viewport,
    isMobile,
    hasTouch,
    baseURL: new URL(page.url()).origin,
    reducedMotion: "reduce",
  });
  const student = await phone.newPage();
  await student.goto(`/join/${code}`);
  await student.getByRole("textbox", { name: "Display name" }).fill("Ada Brennan");
  await student.getByRole("button", { name: "Join", exact: true }).click();
  await expect(student).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  const roomUrl = student.url();
  await expect(student.getByText("You are in.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("present-count")).toHaveText("1 phone connected", {
    timeout: 15_000,
  });
  const joinedAs = await participantCookie(phone);
  expect(joinedAs).toBeTruthy();

  let broken = false;
  await student.route("**/api/live/view", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { state?: { status?: string } };
    if (!broken && body.state?.status === "running") {
      broken = true;
      await route.fulfill({ response, json: { ...body, state: null } });
      return;
    }
    await route.fulfill({ response });
  });

  await page.getByRole("button", { name: "Start session", exact: true }).click();

  // The room's boundary, not a blank page and not the error.
  await expect(
    student.getByRole("heading", { level: 1, name: "This screen stopped working.", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  // Next's route announcer is an alert too, so the boundary's is picked out by what it says.
  await expect(
    student.getByRole("alert").filter({ hasText: "Your place in the session is kept." }),
  ).toBeVisible();
  await expect(student.getByText(/Cannot read|TypeError|null|digest/)).toHaveCount(0);
  expect(broken).toBe(true);
  await expectNoAxeViolations(student);
  // The room unmounted and left the channel, so the host sees the phone go.
  await expect(page.getByTestId("present-count")).toHaveText("0 phones connected", {
    timeout: 15_000,
  });

  await student.getByRole("button", { name: "Try again", exact: true }).click();

  // Back in the same room, on the item the host moved to while the phone was down.
  await expect(student.getByText(STEM, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(student).toHaveURL(roomUrl);
  await expect(student.getByText("Ada Brennan", { exact: true })).toBeVisible();
  await expect(student.getByRole("textbox", { name: "Display name" })).toHaveCount(0);
  expect(await participantCookie(phone)).toBe(joinedAs);
  // Presence is keyed by participant id: the same participant is one phone, not a second one.
  await expect(page.getByTestId("present-count")).toHaveText("1 phone connected", {
    timeout: 15_000,
  });

  // And the server still takes this phone's answer as that participant's.
  // Anchored rather than `exact`: the option's name carries its letter marker in front.
  await student.getByRole("radio", { name: /^A\W*Bradycardia$/ }).click();
  await student.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(student.getByTestId("answer-sent")).toBeVisible();

  await phone.close();
});
