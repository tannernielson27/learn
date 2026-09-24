import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { latestSignInLink } from "./mailbox";
import { insertAsAdmin, selectAsAdmin, signInAsNewAuthor } from "./signIn";

// #211: an instructor watches an assignment's progress while it is open (no score anywhere, no
// CSV), and after the close reads the report by student, item and CJMM step and downloads the CSV.
// The student's second attempt is left open at the close, so the report's own submit at close is
// what counts it. Needs the local Supabase stack; CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// The seeded "Samples" bank (supabase/seed.sql), in the first org, where signInAsNewAuthor puts
// its instructor.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";

/** Long enough for the student to take and submit one attempt and start another, and the
 * instructor to read the progress; it starts only after sign-in and the email round trip. */
const WINDOW_MS = 60_000;

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

test("an instructor sees progress while open, then the report and its CSV after close", async ({
  page,
  browser,
  request,
}, testInfo) => {
  // Setup plus a real window that has to pass: well over the default timeout, even tripled.
  test.setTimeout(180_000);
  const project = testInfo.project.name;
  const shot = (name: string) => `test-results/screenshots/${project}/${name}.png`;

  // An instructor, a class, and a student who joins it from the invite link.
  await signInAsNewAuthor(page, request, `report-${project}`);
  const className = `NUR 330 ${Date.now() % 100_000}`;
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(className);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  const classPage = page.url();
  const classId = classPage.split("/").at(-1) as string;
  const invite = await page.getByRole("textbox", { name: "Invite link", exact: true }).inputValue();

  const phone = await browser.newContext({ reducedMotion: "reduce" });
  const student = await phone.newPage();
  await student.goto(invite);
  const email = `student-report-${project}-${Date.now()}@example.test`;
  const since = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await student.goto(await latestSignInLink(request, email, since));
  await expect(student).toHaveURL(/\/learn$/);

  // Assigned now, closing shortly, two attempts.
  const [klass] = await selectAsAdmin<{ org_id: string }>(
    request,
    "classes",
    `id=eq.${classId}&select=org_id`,
  );
  const title = `Week 6 report ${project}`;
  const closesAt = Date.now() + WINDOW_MS;
  const assignment = await insertAsAdmin<{ id: string }>(request, "assignments", {
    org_id: klass?.org_id,
    class_id: classId,
    bank_id: SAMPLES_BANK,
    title,
    opens_at: new Date(Date.now() - 60_000).toISOString(),
    closes_at: new Date(closesAt).toISOString(),
    max_attempts: 2,
    shuffle_options: false,
  });
  const reportPath = `/author/assignments/${assignment.id}/report`;

  // Attempt 1: one answer, submitted. Attempt 2: one answer, left open.
  await student.goto(`/learn/assignments/${assignment.id}`);
  await student.getByRole("button", { name: "Start", exact: true }).click();
  const status = student.getByTestId("save-status");
  await student.getByRole("radio", { name: /Auscultate the lungs/ }).click();
  await expect(status).toHaveText("Saved", { timeout: 15_000 });
  await student.getByRole("button", { name: "Submit assignment", exact: true }).click();
  await student.getByRole("button", { name: "Submit now", exact: true }).click();
  await expect(student.getByTestId("submitted-notice")).toBeVisible({ timeout: 15_000 });
  await student.getByRole("button", { name: "Start attempt 2", exact: true }).click();
  await student.getByRole("radio", { name: /Auscultate the lungs/ }).click();
  await expect(status).toHaveText("Saved", { timeout: 15_000 });

  // If the steps above ran slow enough to reach the close, the checks below would be meaningless.
  expect(Date.now(), "the window closed before the open-state checks ran").toBeLessThan(
    closesAt - 10_000,
  );
  // While open: progress only, reached from the class page.
  await page.goto(classPage);
  await page.getByRole("link", { name: `View progress for ${title}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${reportPath}$`));
  const progress = page.getByRole("region", { name: "Progress by student", exact: true });
  await expect(progress.getByRole("row", { name: new RegExp(`^${email}`) })).toContainText(
    "In progress",
  );
  await expect(progress).toContainText("2 of 2");
  await expect(page.getByRole("link", { name: "Download CSV", exact: true })).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/%/);
  const earlyCsv = await page.context().request.get(`${reportPath}/csv`);
  expect(earlyCsv.status()).toBe(409);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: shot("assignment-report-progress"), fullPage: true });

  // After the close (and its two seconds of grace): the open attempt is submitted by the report.
  await page.waitForTimeout(Math.max(0, closesAt + 3_000 - Date.now()));
  await page.reload();
  const scores = page.getByRole("region", { name: "Scores by student", exact: true });
  const row = scores.getByRole("row", { name: new RegExp(`^${email}`) });
  await expect(row).toContainText("Submitted");
  await expect(row).toContainText("2 of 2");
  await expect(row).toContainText("%");
  const [second] = await selectAsAdmin<{ auto_submitted: boolean; score: number | null }>(
    request,
    "assignment_attempts",
    `assignment_id=eq.${assignment.id}&number=eq.2&select=auto_submitted,score`,
  );
  expect(second).toMatchObject({ auto_submitted: true });
  expect(second?.score).not.toBeNull();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: shot("assignment-report-students"), fullPage: true });

  const views = page.getByRole("navigation", { name: "Report views", exact: true });
  await views.getByRole("link", { name: "Items", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${reportPath}\\?view=items$`));
  await expect(page.getByRole("columnheader", { name: "Correct", exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: shot("assignment-report-items"), fullPage: true });

  await views.getByRole("link", { name: "CJMM steps", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${reportPath}\\?view=steps$`));
  await expectNoAxeViolations(page);
  await page.screenshot({ path: shot("assignment-report-steps"), fullPage: true });

  // The CSV: a download, uncached, with the student's row.
  const download = page.getByRole("link", { name: "Download CSV", exact: true });
  await expect(download).toHaveAttribute("href", `${reportPath}/csv`);
  const csv = await page.context().request.get(`${reportPath}/csv`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toMatch(/^attachment; filename="[a-z0-9-]+\.csv"$/);
  expect(csv.headers()["cache-control"]).toBe("no-store");
  const body = await csv.text();
  expect(body).toMatch(/^﻿?Student,Q1 /);
  expect(body).toContain(`${email},`);
  expect(body).toContain(",2,Submitted\r\n");

  // A student cannot reach the report or its file.
  await student.goto(reportPath);
  await expect(student).not.toHaveURL(new RegExp(`${reportPath}$`));
  const studentCsv = await phone.request.get(`${reportPath}/csv`);
  expect(studentCsv.status()).toBe(403);
  expect(await studentCsv.text()).not.toContain(email);

  await phone.close();
});
