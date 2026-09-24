import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { latestSignInLink } from "./mailbox";
import { insertAsAdmin, selectAsAdmin, signInAsNewAuthor } from "./signIn";

// #210: once an assignment closes, a student reads their best attempt's score and every item with
// its key and rationale; before the close the results page carries none of it. A bank the student
// answered, and a case study they never started (the key and the patient record, "You did not
// attempt this"). Needs the local Supabase stack; CI runs it in the `auth-e2e` job.
//
// An assignment cannot be created already closed, and moving its close into the past is refused by
// the guard trigger, so this waits out a short real window, started only after sign-in and the
// email round trip, with a guard that fails the run if the open-state checks ran too late.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// The seeded "Samples" bank and case study (supabase/seed.sql), in the first org, which is the org
// signInAsNewAuthor makes its instructor in.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";
const SAMPLE_CASE_STUDY = "00000000-0000-4000-8000-000000000003";
const MC_ITEM = "00000000-0000-4000-8000-000000000100";
const CASE_STEP_6 = "00000000-0000-4000-8000-000000000120";

// The seeded items' own rationales, so the control can find them where they are allowed to be.
const MC_RATIONALE = "Rapid weight gain with orthopnea suggests fluid overload.";
const MR_RATIONALE = "Tachypnea, hypoxemia, and new confusion indicate worsening gas exchange";
const STEP_6_RATIONALE = "Oxygenation and respiratory rate have improved";
const KEY_MARKERS = ["answerKey", "correctOptionId", "correctOptionIds", '"score":', "max_score"];

/** Long enough to take and submit one attempt and check the pages before the close. */
const WINDOW_MS = 60_000;

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/** The bytes a page's own GET returns to this browser: the HTML and its inline Flight payload. */
async function bytesOf(context: BrowserContext, path: string): Promise<string> {
  const response = await context.request.get(path);
  expect(response.ok()).toBe(true);
  return response.text();
}

function expectKeyless(bytes: string, rationales: readonly string[]): void {
  for (const text of rationales) expect(bytes).not.toContain(text);
  for (const marker of KEY_MARKERS) expect(bytes).not.toContain(marker);
}

test("a student sees nothing before the close, then their score, keys and rationales", async ({
  page,
  browser,
  request,
}, testInfo) => {
  // Setup plus a real window that has to pass.
  test.setTimeout(180_000);
  const project = testInfo.project.name;
  const shot = (name: string) => `test-results/screenshots/${project}/${name}.png`;

  // An instructor, a class, and a student who joins it from the invite link.
  await signInAsNewAuthor(page, request, `results-${project}`);
  const className = `NUR 340 ${Date.now() % 100_000}`;
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(className);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  const classId = page.url().split("/").at(-1) as string;
  const invite = await page.getByRole("textbox", { name: "Invite link", exact: true }).inputValue();

  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const phone = await browser.newContext({ viewport, isMobile, hasTouch, reducedMotion: "reduce" });
  const student = await phone.newPage();
  await student.goto(invite);
  const email = `student-results-${project}-${Date.now()}@example.test`;
  const since = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await student.goto(await latestSignInLink(request, email, since));
  await expect(student).toHaveURL(/\/learn$/);

  // #233: the invite page is public, so it must not carry who is already on the roster. The
  // control: the instructor's roster response does carry the student's address.
  expect(await bytesOf(page.context(), `/author/classes/${classId}`)).toContain(email);
  const stranger = await browser.newContext();
  expect(await bytesOf(stranger, invite)).not.toContain(email);
  await stranger.close();

  // Both assigned now, closing shortly; the clock starts only after the sign-in above.
  const [klass] = await selectAsAdmin<{ org_id: string }>(
    request,
    "classes",
    `id=eq.${classId}&select=org_id`,
  );
  const closesAt = Date.now() + WINDOW_MS;
  const assign = (source: { bank_id: string } | { case_study_id: string }, title: string) =>
    insertAsAdmin<{ id: string }>(request, "assignments", {
      org_id: klass?.org_id,
      class_id: classId,
      ...source,
      title,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      closes_at: new Date(closesAt).toISOString(),
      max_attempts: 1,
      shuffle_options: false,
    });
  const bankTitle = `Week 7 ${project}`;
  const caseTitle = `Hip case results ${project}`;
  const bank = await assign({ bank_id: SAMPLES_BANK }, bankTitle);
  const caseStudy = await assign({ case_study_id: SAMPLE_CASE_STUDY }, caseTitle);
  const bankResults = `/learn/assignments/${bank.id}/results`;
  const caseResults = `/learn/assignments/${caseStudy.id}/results`;

  // The bank: the MC right, and the SATA with one of its three right options missed.
  await student.goto(`/learn/assignments/${bank.id}`);
  await student.getByRole("button", { name: "Start", exact: true }).click();
  const status = student.getByTestId("save-status");
  await student.getByRole("radio", { name: /Auscultate the lungs/ }).click();
  await expect(status).toHaveText("Saved", { timeout: 15_000 });
  await student.getByRole("button", { name: "Next item", exact: true }).click();
  await student.getByRole("checkbox", { name: /Respiratory rate 28 breaths/ }).click();
  await student.getByRole("checkbox", { name: /Oxygen saturation 89%/ }).click();
  await expect(status).toHaveText("Saved", { timeout: 15_000 });
  await student.getByRole("button", { name: "Submit assignment", exact: true }).click();
  await student.getByRole("button", { name: "Submit now", exact: true }).click();
  await expect(student.getByTestId("submitted-notice")).toBeVisible({ timeout: 15_000 });

  // If the steps above ran slow enough to reach the close, the checks below would be meaningless.
  expect(Date.now(), "the window closed before the open-state checks ran").toBeLessThan(
    closesAt - 10_000,
  );

  // Before the close. The control first: the rationales are in an author's response and the score
  // is in the database, so the probes below can see them where they exist.
  expect(await bytesOf(page.context(), `/author/items/${MC_ITEM}`)).toContain(MC_RATIONALE);
  expect(await bytesOf(page.context(), `/author/items/${CASE_STEP_6}`)).toContain(STEP_6_RATIONALE);
  const [scored] = await selectAsAdmin<{ score: number | null }>(
    request,
    "assignment_attempts",
    `assignment_id=eq.${bank.id}&select=score`,
  );
  expect(scored?.score).not.toBeNull();

  await student.goto(bankResults);
  await expect(student.getByTestId("results-pending")).toHaveText(
    "Your results will be shown when the assignment closes.",
  );
  expectKeyless(await bytesOf(phone, bankResults), [MC_RATIONALE, MR_RATIONALE]);
  expectKeyless(await bytesOf(phone, caseResults), [STEP_6_RATIONALE]);
  // #233: the student home lists both open assignments; the same controls above cover it.
  expectKeyless(await bytesOf(phone, "/learn"), [MC_RATIONALE, MR_RATIONALE, STEP_6_RATIONALE]);
  await student.goto("/learn");
  await expect(
    student.getByRole("link", { name: `Results for ${bankTitle}`, exact: true }),
  ).toHaveCount(0);
  await expectNoAxeViolations(student);

  // After the close (and its two seconds of grace).
  await student.waitForTimeout(Math.max(0, closesAt + 3_000 - Date.now()));
  await student.goto("/learn");
  const closed = student.getByRole("list", { name: "Assignment history", exact: true });
  await closed.getByRole("link", { name: `Results for ${bankTitle}`, exact: true }).click();
  await expect(student).toHaveURL(new RegExp(`${bankResults}$`));

  const total = student.getByRole("region", { name: "Your score", exact: true });
  await expect(total.getByTestId("results-total")).toHaveText(/^\d+(\.\d+)? of \d+(\.\d+)?$/);
  await expect(total).toContainText("From your one attempt.");
  await expect(student.getByText(MC_RATIONALE, { exact: false }).first()).toBeVisible();
  // Right and wrong in words, on each option's own name, beside the icon and the colour.
  await expect(student.getByRole("radio", { name: /Auscultate the lungs/ })).toHaveAccessibleName(
    /Correct/,
  );
  await expectNoAxeViolations(student);
  await student.screenshot({ path: shot("assignment-results-bank"), fullPage: true });

  // The SATA: the missed option named in words, not only in colour.
  await student.getByRole("button", { name: "Next item", exact: true }).click();
  await expect(
    student.getByRole("checkbox", { name: /New confusion per family/ }),
  ).toHaveAccessibleName(/Missed/);
  await expect(
    student.getByRole("checkbox", { name: /Oxygen saturation 89%/ }),
  ).toHaveAccessibleName(/Correct/);
  await expect(student.getByText(MR_RATIONALE, { exact: false }).first()).toBeVisible();
  await expectNoAxeViolations(student);
  await student.screenshot({ path: shot("assignment-results-sata"), fullPage: true });

  // On the wire now: the keys and rationales, for this student's page.
  const after = await bytesOf(phone, bankResults);
  expect(after).toContain(MC_RATIONALE);
  expect(after).toContain("correctOptionId");

  // The case study, never started: every step's key beside the patient record.
  await student.goto(caseResults);
  await expect(student.getByRole("region", { name: "Your score", exact: true })).toContainText(
    "You did not attempt this assignment.",
  );
  await expect(student.getByText("You did not attempt this.", { exact: true })).toBeVisible();
  await expect(
    student
      .getByRole("button", { name: "Patient record", exact: true })
      .or(student.getByRole("tablist", { name: "Patient record sections", exact: true }))
      .first(),
  ).toBeVisible();
  await expect(
    student.getByRole("complementary", { name: "Rationale", exact: true }),
  ).toBeVisible();
  await expectNoAxeViolations(student);
  await student.screenshot({ path: shot("assignment-results-case-study"), fullPage: true });
  expect(await bytesOf(phone, caseResults)).toContain(STEP_6_RATIONALE);

  // The instructor is not a student: the student's results route sends them away.
  await page.goto(bankResults);
  await expect(page).not.toHaveURL(new RegExp(`${bankResults}$`));

  await phone.close();
});
