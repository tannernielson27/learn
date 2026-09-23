import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Download,
  type Page,
} from "@playwright/test";
import { sampleCaseStudy } from "../src/lib/ngn/fixtures/case-study";
import { fillMultipleResponse, publishOpenItem } from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like liveSession.spec.ts. CI runs it in the `auth-e2e` job,
// which also starts Realtime: every move below reaches the phones over a channel.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

const STEM = "Which findings require immediate follow-up?";
/**
 * Five, not four. The Extended Multiple Response editor opens with five blank option fields and
 * every label is required, so filling fewer leaves the item invalid and `publishOpenItem`
 * refuses — the thing that failed CI on #128, one option further along.
 */
const OPTIONS = [
  "Respiratory rate 28 breaths per minute",
  "Oxygen saturation 89 percent on room air",
  "Temperature 37.2 degrees Celsius",
  "New confusion per family",
  "Productive cough with yellow sputum",
];
/** A select-all-that-apply key: the first two are right, the last two are not. */
const CORRECT = [0, 1];
const RATIONALE = "Why the answer is right.";

/**
 * Joins the open session as `name`, in a browser of its own.
 *
 * A context of its own and not another tab, because the participant cookie is one cookie per
 * browser: a second tab sharing it would come back as the *same* participant, which is what
 * join.spec.ts proves on purpose. Three phones are three browsers.
 */
async function join(
  browser: Browser,
  origin: string,
  viewport: BrowserContextOptions,
  code: string,
  name: string,
): Promise<Page> {
  const context = await browser.newContext({
    ...viewport,
    baseURL: origin,
    reducedMotion: "reduce",
  });
  const phone = await context.newPage();
  await phone.goto(`/join/${code}`);
  await phone.getByRole("textbox", { name: "Display name" }).fill(name);
  // Exact on a short button name: it has bitten this repo twice.
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  return phone;
}

/** Selects the key's options and submits, leaving the phone in the sent state. */
async function answer(phone: Page, picks: number[]) {
  for (const index of picks) {
    await phone.getByRole("checkbox", { name: OPTIONS[index] as string }).click();
  }
  await phone.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(phone.getByTestId("answer-sent")).toBeVisible();
}

/**
 * Sprint 7's demo, end to end: three phones join a room from the code, answer the same SATA, the
 * host watches the count fill, and the reveal puts the key and the rationale on every phone.
 *
 * It is also the regression test for the seam #129 and #131 left open. Answering at all is only
 * possible because `/api/live/submit` now accepts the same httpOnly cookie the join set; if the
 * two identity schemes ever drift apart again, the first submit below is what fails.
 */
test("three phones answer a live SATA, and the reveal shows the key on all of them", async ({
  browser,
  page,
  request,
}, testInfo) => {
  // Sign-in, a bank, a published item, a session and three phones through a whole round.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);

  const bankName = `Answer ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Extended Multiple Response", exact: true }).click();
  await fillMultipleResponse(page, STEM, OPTIONS, CORRECT);
  await publishOpenItem(page);
  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);

  const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");
  const origin = new URL(page.url()).origin;
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const shape: BrowserContextOptions = { viewport, isMobile, hasTouch };

  const phones: Page[] = [];
  for (const name of ["Ada Brennan", "Bo Ntuli", "Chidi Okeke"]) {
    phones.push(await join(browser, origin, shape, code, name));
  }
  // A fourth phone that stays quiet all item long (#181): it still sees the key at the reveal.
  const quiet = await join(browser, origin, shape, code, "Dara Quinn");
  await expect(page.getByTestId("present-count")).toHaveText("4 phones connected", {
    timeout: 15_000,
  });

  // Nothing to answer yet, and nothing to count.
  await expect(page.getByTestId("answer-count")).toHaveCount(0);
  for (const phone of [...phones, quiet]) {
    await expect(phone.getByText("You are in.")).toBeVisible();
  }

  await page.getByRole("button", { name: "Start session", exact: true }).click();

  // The item reaches every phone over the channel, with no reload and no key on it.
  for (const phone of phones) {
    await expect(phone.getByText(STEM)).toBeVisible({ timeout: 15_000 });
    await expect(phone.getByRole("checkbox", { name: OPTIONS[0] as string })).toBeVisible();
    await expect(phone.getByText(RATIONALE)).toHaveCount(0);
  }
  await expectNoAxeViolations(phones[0] as Page);

  // Two right, one partly right: the room is not a single answer.
  await answer(phones[0] as Page, CORRECT);
  await answer(phones[1] as Page, CORRECT);
  await answer(phones[2] as Page, [0, 2]);

  // The count the host watches before deciding to reveal. It is polled, not pushed (ADR 0002).
  await expect(page.getByTestId("answer-count")).toHaveText("3 of 4 answered", {
    timeout: 15_000,
  });
  await expectNoAxeViolations(page);

  // #180: the console draws how the room answered, option by option, on the same poll. Nothing
  // is marked correct yet: a projected console must not give the answer away.
  const resultRow = (index: number) =>
    page
      .getByRole("list", { name: "Options", exact: true })
      .getByRole("listitem")
      .filter({ hasText: OPTIONS[index] as string });
  await expect(resultRow(0)).toContainText("3 of 3 · 100%", { timeout: 15_000 });
  await expect(resultRow(1)).toContainText("2 of 3 · 67%");
  await expect(resultRow(2)).toContainText("1 of 3 · 33%");
  await expect(resultRow(3)).toContainText("0 of 3 · 0%");
  await expect(page.getByTestId("result-correct")).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/live-results-console.png`,
    fullPage: true,
  });

  // "Hide results" takes the tallies off the projector and puts them back.
  await page.getByRole("button", { name: "Hide results", exact: true }).click();
  await expect(page.getByRole("list", { name: "Options", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show results", exact: true }).click();
  await expect(resultRow(0)).toContainText("3 of 3 · 100%");

  // A reload mid-item comes back to the answer that was sent, not to a blank form.
  const reloaded = phones[0] as Page;
  await reloaded.reload();
  await expect(reloaded.getByTestId("answer-sent")).toBeVisible();
  await expect(reloaded.getByRole("checkbox", { name: OPTIONS[0] as string })).toBeChecked();
  await expect(reloaded.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Show answer", exact: true }).click();

  // The key and the rationale, on every phone, with each phone's own marks.
  for (const phone of phones) {
    await expect(phone.getByRole("complementary", { name: "Score" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(phone.getByText(RATIONALE)).toBeVisible();
  }
  // +/- scoring over two correct options: both right is two, one right and one wrong is nought.
  // Two phones, two different marks, from one key on one server.
  await expect((phones[0] as Page).getByRole("complementary", { name: "Score" })).toContainText(
    "2 / 2",
  );
  await expect((phones[2] as Page).getByRole("complementary", { name: "Score" })).toContainText(
    "0 / 2",
  );
  await expectNoAxeViolations(phones[0] as Page);

  // And on the console, the two correct options are now marked, in words, and only those.
  await expect(page.getByTestId("result-correct")).toHaveCount(CORRECT.length, {
    timeout: 15_000,
  });
  for (const index of CORRECT) {
    await expect(resultRow(index).getByTestId("result-correct")).toContainText("Correct");
  }
  await expect(resultRow(2).getByTestId("result-correct")).toHaveCount(0);
  await expectNoAxeViolations(page);

  // The phone that did not answer sees the key and the rationale too, with no marks (#181).
  await expect(quiet.getByTestId("not-answered")).toHaveText(
    "You did not answer this item. Here is the answer your instructor is showing.",
    { timeout: 15_000 },
  );
  await expect(quiet.getByText(RATIONALE, { exact: true })).toBeVisible();
  await expect(quiet.getByRole("complementary", { name: "Rationale", exact: true })).toBeVisible();
  await expect(quiet.getByRole("complementary", { name: "Score", exact: true })).toHaveCount(0);
  await expect(quiet.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);
  await expect(quiet.getByRole("checkbox", { name: OPTIONS[0] as string })).not.toBeChecked();
  await expectNoAxeViolations(quiet);
  await quiet.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/live-reveal-not-answered.png`,
    fullPage: true,
  });

  // A late answer, after the key is up, is refused rather than quietly taken.
  await expect(
    (phones[2] as Page).getByRole("button", { name: "Submit", exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "End session", exact: true }).click();
  for (const phone of [...phones, quiet]) {
    await expect(phone.getByText("This session has ended.")).toBeVisible({ timeout: 15_000 });
    await phone.context().close();
  }

  await readTheReport(page, bankName);
});

/** No sideways scroll on the page itself: a wide table scrolls inside its own box (#186). */
async function expectNoPageScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Sprint 8's report demo (#186), on the session the test above just ran: open the report from the
 * ended console, read a student's score, switch to the CJMM view, download the CSV, and find the
 * session in the list.
 */
async function readTheReport(page: Page, bankName: string) {
  await page.getByRole("link", { name: "Open the report", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}\/report$/);
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  const scores = page.getByRole("region", { name: "Scores by student" });
  await expect(scores.getByRole("row", { name: /^Ada Brennan/ })).toContainText("2 / 2");
  await expect(scores.getByRole("row", { name: /^Chidi Okeke/ })).toContainText("0 / 2");
  await expectNoPageScroll(page);
  await expectNoAxeViolations(page);

  await page.getByRole("link", { name: "Items", exact: true }).click();
  await expect(page.getByRole("region", { name: "Results by item" })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("link", { name: "CJMM steps", exact: true }).click();
  await expect(page).toHaveURL(/\?view=steps$/);
  // The item written above carries no step, so the view says why it is empty.
  await expect(page.getByText(/No item in this session is tagged with a CJMM step/)).toBeVisible();
  await expectNoAxeViolations(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await readDownload(download);
  expect(csv).toContain("Ada Brennan,2,2,2,100\r\n");
  expect(csv).toContain("Chidi Okeke,0,0,2,0\r\n");

  await page.goto("/author/sessions");
  await expect(page.getByRole("link", { name: new RegExp(bankName) }).first()).toBeVisible();
  await expectNoAxeViolations(page);
}

async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * #182's demo: set 30 seconds and start; the phone counts down with the console; an answer after
 * zero is refused with "Time is up"; adding fifteen seconds gives the item back.
 *
 * It waits out a real thirty seconds, because the point is what the server's own clock decides —
 * nothing here can be faked from the browser — so it is given the time to do so.
 */
test("a timed item counts down on the phone, and refuses an answer after zero", async ({
  browser,
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  await signInAsNewAuthor(page, request, testInfo.project.name);

  const bankName = `Timer ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Extended Multiple Response", exact: true }).click();
  await fillMultipleResponse(page, STEM, OPTIONS, CORRECT);
  await publishOpenItem(page);
  await page.getByRole("link", { name: "Back to bank" }).click();
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);

  const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const phone = await join(
    browser,
    new URL(page.url()).origin,
    { viewport, isMobile, hasTouch },
    code,
    "Ada Brennan",
  );

  // The time is chosen in the lobby and applies from the first item.
  const perItem = page.getByRole("combobox", { name: "Time per item" });
  await perItem.selectOption({ label: "30 seconds" });
  await expect(perItem).toHaveValue("30");
  await page.getByRole("button", { name: "Start session", exact: true }).click();

  // Both screens count down, from the same end time on the database's clock.
  await expect(page.getByRole("timer")).toHaveText(/^0:(2\d|30)$/, { timeout: 15_000 });
  await expect(phone.getByRole("timer")).toHaveText(/^0:(2\d|30)$/, { timeout: 15_000 });
  await expectNoAxeViolations(page);
  await expectNoAxeViolations(phone);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/live-timer-console.png`,
    fullPage: true,
  });
  await phone.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/live-timer-phone.png`,
    fullPage: true,
  });

  // An answer picked in time, sent after zero and the two seconds of grace.
  await phone.getByRole("checkbox", { name: OPTIONS[0] as string }).click();
  await expect(phone.getByTestId("countdown-state")).toHaveText("Time is up", { timeout: 45_000 });
  await expect(page.getByTestId("countdown-state")).toHaveText("Time is up");
  // The grace is the server's: waiting it out is the only way to be past it.
  await phone.waitForTimeout(3_000);
  await phone.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(phone.getByRole("heading", { name: "Time is up", exact: true })).toBeVisible();
  await expect(phone.getByTestId("answer-late")).toBeVisible();
  await expectNoAxeViolations(phone);
  await phone.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/live-timer-phone-late.png`,
    fullPage: true,
  });
  // Nothing was taken, so the console has nothing to count.
  await expect(page.getByTestId("answer-count")).toHaveText("0 of 1 answered", {
    timeout: 15_000,
  });

  // Fifteen more seconds, and the phone has the item back with its answer still ticked.
  await page.getByRole("button", { name: "Add 15 seconds", exact: true }).click();
  await expect(phone.getByRole("checkbox", { name: OPTIONS[0] as string })).toBeChecked({
    timeout: 15_000,
  });
  await phone.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(phone.getByTestId("answer-sent")).toBeVisible();
  await expect(page.getByTestId("answer-count")).toHaveText("1 of 1 answered", {
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(phone.getByText("This session has ended.")).toBeVisible({ timeout: 15_000 });
  await phone.context().close();
});

/**
 * #183's demo, on two items: answer item 1, jump on to item 2 from the console's item strip, then
 * back. The phone returns to item 1 showing the answer it sent, and the console counts it.
 */
test("the host skips to an item and goes back, and the phone keeps its answer", async ({
  browser,
  page,
  request,
}, testInfo) => {
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);

  const bankName = `Goto ${testInfo.project.name} ${Date.now()}`;
  const SECOND_STEM = "Which findings are expected after the procedure?";
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  // `start_session` orders the set by when each item was made, so this one is item 1.
  for (const stem of [STEM, SECOND_STEM]) {
    await page.getByRole("link", { name: "New item" }).click();
    await page.getByRole("button", { name: "Extended Multiple Response", exact: true }).click();
    await fillMultipleResponse(page, stem, OPTIONS, CORRECT);
    await publishOpenItem(page);
    await page.getByRole("link", { name: "Back to bank" }).click();
    await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  }
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);

  const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const phone = await join(
    browser,
    new URL(page.url()).origin,
    { viewport, isMobile, hasTouch },
    code,
    "Ada Brennan",
  );
  await expect(page.getByTestId("present-count")).toHaveText("1 phone connected", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(phone.getByText(STEM)).toBeVisible({ timeout: 15_000 });
  await answer(phone, CORRECT);
  await expect(page.getByTestId("answer-count")).toHaveText("1 of 1 answered", {
    timeout: 15_000,
  });

  const strip = page.getByRole("navigation", { name: "Items" });
  await strip.getByRole("button", { name: "Go to item 2", exact: true }).click();
  await expect(phone.getByText(SECOND_STEM)).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByRole("button", { name: "Submit", exact: true })).toBeVisible();
  await expect(page.getByText(/Item 2 of 2/)).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/live-item-strip.png`,
    fullPage: true,
  });

  // Back to item 1 from the keyboard: the phone shows what it sent, not a fresh item.
  await strip.getByRole("button", { name: "Go to item 1", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(phone.getByText(STEM)).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByTestId("answer-sent")).toBeVisible();
  await expect(phone.getByRole("checkbox", { name: OPTIONS[0] as string })).toBeChecked();
  await expect(phone.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("answer-count")).toHaveText("1 of 1 answered", {
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(phone.getByText("This session has ended.")).toBeVisible({ timeout: 15_000 });
  await phone.context().close();
});

/** The seeded sample case study (supabase/seed.sql), in the org the demo account signs in to. */
const SAMPLE_CASE_STUDY = "00000000-0000-4000-8000-000000000003";
const CASE_STEP_1_STEM = /^Click to highlight the findings in the 1400 nurses/;
const CASE_STEP_1_RATIONALE =
  "Acute dyspnea, pleuritic pain, hypoxemia, and a unilateral swollen calf together point to a venous thromboembolic event.";
const CASE_STEP_2_STEM = /^For each finding, select every condition it is consistent with/;

/**
 * Serious and critical only, as the other record screens hold themselves (ehr.spec.ts,
 * case-study.spec.ts): the record's pane comes before the room in reading order, so its own
 * heading precedes the page's h1, which axe reports as a moderate best-practice finding.
 */
async function expectNoBlockingAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
}

/** Checks the record is on the phone: in the pane at 1280, behind the chip below that. */
async function expectPatientRecord(phone: Page, projectName: string) {
  if (projectName === "desktop-1280") {
    const pane = phone.getByRole("complementary", { name: "Patient record", exact: true });
    await expect(pane).toBeVisible();
    await expect(pane).toContainText("Orthopedic unit");
    return;
  }
  const chip = phone.getByRole("button", { name: "Patient record", exact: true });
  if (projectName === "phone-375") await chip.tap();
  else await chip.click();
  // A phone gets the modal sheet, a tablet the in-flow drawer (EhrPanel).
  const record =
    projectName === "phone-375"
      ? phone.getByRole("dialog", { name: "Patient record", exact: true })
      : phone.getByRole("tablist", { name: "Patient record sections", exact: true });
  await expect(record).toBeVisible();
  await expect(phone.getByText(/Orthopedic unit/).filter({ visible: true })).toHaveCount(1);
  await expectNoBlockingAxeViolations(phone);
  await phone.screenshot({
    path: `test-results/screenshots/${projectName}/live-case-study-record.png`,
    fullPage: false,
  });
  // Escape closes the sheet, and the drawer too while focus is still on the chip.
  await phone.keyboard.press("Escape");
  await expect(phone.getByRole("dialog")).toHaveCount(0);
}

/**
 * #184's demo: start the seeded case study live; a phone shows step 1 with the patient record;
 * reveal; advance to step 2. That no key reaches the phone before its step is revealed is proved
 * on the bytes in `caseStudyWire.test.ts`; this proves the room works end to end.
 */
test("a case study runs live with the patient record beside each step on the phone", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(!process.env.DEMO_ACCOUNT_EMAIL, "set DEMO_ACCOUNT_EMAIL and DEMO_ACCOUNT_PASSWORD");
  test.slow();

  // The demo account is in the seeded org, which holds the published sample case study.
  await page.goto("/author");
  await page.getByRole("button", { name: "Use the demo account", exact: true }).click();
  await expect(page).toHaveURL(/\/author$/);

  await page.goto(`/author/case-studies/${SAMPLE_CASE_STUDY}`);
  await expect(
    page.getByRole("heading", { level: 1, name: sampleCaseStudy.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);

  const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const phone = await join(
    browser,
    new URL(page.url()).origin,
    { viewport, isMobile, hasTouch },
    code,
    "Ada Brennan",
  );
  await expect(page.getByTestId("present-count")).toHaveText("1 phone connected", {
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Start session", exact: true }).click();
  // The console names the step with its position.
  await expect(page.getByText(/Step 1 of 6: Recognize Cues/)).toBeVisible({ timeout: 15_000 });
  await expectNoAxeViolations(page);

  // Step 1 on the phone, with the record beside it and no key.
  await expect(phone.getByText(CASE_STEP_1_STEM)).toBeVisible({
    timeout: 15_000,
  });
  await expect(phone.getByText(CASE_STEP_1_RATIONALE)).toHaveCount(0);
  await expectNoBlockingAxeViolations(phone);
  await phone.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/live-case-study-step.png`,
    fullPage: true,
  });
  await expectPatientRecord(phone, testInfo.project.name);

  // Reveal: a phone that did not answer is told the answer is showing, and is not shown the key.
  await page.getByRole("button", { name: "Show answer", exact: true }).click();
  await expect(phone.getByText("The answer is showing.", { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // Advance to step 2, on both screens.
  await page.getByRole("button", { name: "Next item", exact: true }).click();
  await expect(page.getByText(/Step 2 of 6: Analyze Cues/)).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText(CASE_STEP_2_STEM)).toBeVisible({
    timeout: 15_000,
  });
  await expect(phone.getByText(CASE_STEP_1_STEM)).toHaveCount(0);
  await expectNoBlockingAxeViolations(phone);

  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(phone.getByText("This session has ended.")).toBeVisible({ timeout: 15_000 });
  await phone.context().close();
});
