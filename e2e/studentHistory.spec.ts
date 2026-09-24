import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { formatPercent, formatPoints } from "../src/lib/live/reportFormat";
import { latestSignInLink } from "./mailbox";
import { insertAsAdmin, selectAsAdmin, signInAsNewAuthor } from "./signIn";

// #238: the student home's History lists each closed assignment with the student's best score, and
// carries no score of an assignment that is still open. One assignment closes during the test
// (two attempts, the first one better); another stays open with a submitted, scored attempt. Needs
// the local Supabase stack; CI runs it in the `auth-e2e` job.
//
// An assignment cannot be created already closed, and moving its close into the past is refused by
// the guard trigger, so this waits out a short real window, started only after sign-in and the
// email round trip, with a guard that fails the run if the open-state checks ran too late.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// The seeded "Samples" bank (supabase/seed.sql), in the first org, which is the org
// signInAsNewAuthor makes its instructor in.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";

/** Long enough to take three attempts and check the page before the close. */
const WINDOW_MS = 120_000;

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

/** Takes one attempt: the seeded MC answered with `option`, then submitted. */
async function takeAttempt(student: Page, path: string, start: string, option: RegExp) {
  await student.goto(path);
  await student.getByRole("button", { name: start, exact: true }).click();
  await student.getByRole("radio", { name: option }).click();
  await expect(student.getByTestId("save-status")).toHaveText("Saved", { timeout: 15_000 });
  await student.getByRole("button", { name: "Submit assignment", exact: true }).click();
  await student.getByRole("button", { name: "Submit now", exact: true }).click();
  await expect(student.getByTestId("submitted-notice")).toBeVisible({ timeout: 15_000 });
}

interface ScoreRow {
  number: number;
  score: number | null;
  max_score: number | null;
}

/** The best submitted attempt, by the owner's rule: the highest total, a tie to the earlier. */
function bestOf(rows: readonly ScoreRow[]): ScoreRow {
  const scored = rows.filter((row) => row.score !== null && row.max_score !== null);
  const [best] = [...scored].sort(
    (a, b) => Number(b.score) - Number(a.score) || a.number - b.number,
  );
  expect(best, "no scored attempt").toBeDefined();
  return best as ScoreRow;
}

test("History shows a closed assignment's best score, and nothing of one still open", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  const project = testInfo.project.name;
  const shot = (name: string) => `test-results/screenshots/${project}/${name}.png`;

  // An instructor, a class, and a student who joins it from the invite link.
  await signInAsNewAuthor(page, request, `history-${project}`);
  const className = `NUR 360 ${Date.now() % 100_000}`;
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
  const email = `student-history-${project}-${Date.now()}@example.test`;
  const since = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await student.goto(await latestSignInLink(request, email, since));
  await expect(student).toHaveURL(/\/learn$/);

  // Nothing has closed yet: the empty state.
  await expect(
    student.getByText(
      "Nothing has closed yet. Your scores appear here once an assignment closes.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();

  // One closing shortly with two attempts, one open for a day with one; the clock starts now.
  const [klass] = await selectAsAdmin<{ org_id: string }>(
    request,
    "classes",
    `id=eq.${classId}&select=org_id`,
  );
  const closesAt = Date.now() + WINDOW_MS;
  const assign = (title: string, closes: number, maxAttempts: number) =>
    insertAsAdmin<{ id: string }>(request, "assignments", {
      org_id: klass?.org_id,
      class_id: classId,
      bank_id: SAMPLES_BANK,
      title,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      closes_at: new Date(closes).toISOString(),
      max_attempts: maxAttempts,
      shuffle_options: false,
    });
  const closingTitle = `Week 8 ${project}`;
  const openTitle = `Week 9 ${project}`;
  const closing = await assign(closingTitle, closesAt, 2);
  const open = await assign(openTitle, Date.now() + 86_400_000, 1);

  // The open one: the MC right, submitted, so a score of it exists in the database.
  await takeAttempt(student, `/learn/assignments/${open.id}`, "Start", /Auscultate the lungs/);
  // The closing one: the MC right first, then wrong, so the first attempt is the best.
  const closingPath = `/learn/assignments/${closing.id}`;
  await takeAttempt(student, closingPath, "Start", /Auscultate the lungs/);
  await takeAttempt(student, closingPath, "Start attempt 2", /Encourage the client to increase/);

  // If the steps above ran slow enough to reach the close, the checks below would be meaningless.
  expect(Date.now(), "the window closed before the open-state checks ran").toBeLessThan(
    closesAt - 10_000,
  );

  // Before the close. The control first: both assignments' scores are in the database.
  const scoresOf = (assignmentId: string) =>
    selectAsAdmin<ScoreRow>(
      request,
      "assignment_attempts",
      `assignment_id=eq.${assignmentId}&select=number,score,max_score&order=number`,
    );
  const closingScores = await scoresOf(closing.id);
  const [openScore] = await scoresOf(open.id);
  expect(closingScores).toHaveLength(2);
  expect(closingScores.every((row) => row.score !== null)).toBe(true);
  expect(openScore?.score).not.toBeNull();

  const before = await bytesOf(phone, "/learn");
  expect(before).toContain(closingTitle); // listed, as open
  expect(before).not.toContain("history-score");
  expect(before).not.toContain("Best score");
  expect(before).not.toContain(`Results for ${closingTitle}`);
  expect(before).not.toContain(`Results for ${openTitle}`);

  // After the close (and its two seconds of grace).
  await student.waitForTimeout(Math.max(0, closesAt + 3_000 - Date.now()));
  await student.goto("/learn");
  const history = student.getByRole("list", { name: "Assignment history", exact: true });
  const rows = history.getByRole("listitem");
  await expect(rows).toHaveCount(1);
  const row = rows.first();

  const best = bestOf(closingScores);
  expect(best.number).toBe(1);
  const score = Number(best.score);
  const maxScore = Number(best.max_score);
  const percent = maxScore > 0 ? ` (${formatPercent((score / maxScore) * 100)})` : "";
  const figure = `${formatPoints(score)} of ${formatPoints(maxScore)}${percent}`;
  const expected = `Best score ${figure}`;
  await expect(row.getByTestId("history-score")).toHaveText(expected);
  await expect(row).toContainText(className);
  await expect(row).toContainText("2 of 2 attempts used");
  await expect(row).toContainText(/Closed \w{3} \d{1,2} \w{3} \d{4}, \d{2}:\d{2} \w+/);
  await expect(
    history.getByRole("link", { name: `Results for ${openTitle}`, exact: true }),
  ).toHaveCount(0);
  await expectNoAxeViolations(student);
  await student.screenshot({ path: shot("student-history"), fullPage: true });

  // On the wire now: the closed one's score, and still nothing of the open one's.
  const after = await bytesOf(phone, "/learn");
  expect(after).toContain("history-score");
  expect(after).toContain(figure);
  expect(after).not.toContain(`Results for ${openTitle}`);

  // Keyboard: the row's link is reachable and opens the results.
  const link = history.getByRole("link", { name: `Results for ${closingTitle}`, exact: true });
  await link.focus();
  await expect(link).toBeFocused();
  await student.keyboard.press("Enter");
  await expect(student).toHaveURL(new RegExp(`${closingPath}/results$`));

  await phone.close();
});
