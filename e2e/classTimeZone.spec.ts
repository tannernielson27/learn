import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { formatInZone } from "../src/lib/classes/timeZone";
import { latestSignInLink } from "./mailbox";
import { insertAsAdmin, selectAsAdmin, signInAsNewAuthor } from "./signIn";

// #242: an instructor sets the class's time zone on the class page, and the student home says due
// times in it; and a student removed after attempting an assignment still shows in its report,
// under "Removed from class", while the removed student no longer sees the class. Needs the local
// Supabase stack; CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// The seeded "Samples" bank (supabase/seed.sql), in the first org, where signInAsNewAuthor puts
// its instructor.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

interface Setup {
  classPage: string;
  classId: string;
  student: Page;
  email: string;
  assignmentId: string;
  title: string;
  closesAt: string;
}

/** An instructor, a class, a student who joins from the invite link, and an open assignment. */
async function setUp(
  page: Page,
  browser: Browser,
  request: APIRequestContext,
  label: string,
): Promise<Setup> {
  await signInAsNewAuthor(page, request, label);
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Class name", exact: true })
    .fill(`NUR 310 ${Date.now() % 100_000}`);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  const classPage = page.url();
  const classId = classPage.split("/").at(-1) as string;
  const invite = await page.getByRole("textbox", { name: "Invite link", exact: true }).inputValue();

  const phone = await browser.newContext({ reducedMotion: "reduce" });
  const student = await phone.newPage();
  await student.goto(invite);
  const email = `student-${label}-${Date.now()}@example.test`;
  const since = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await student.goto(await latestSignInLink(request, email, since));
  await expect(student).toHaveURL(/\/learn$/);

  const [klass] = await selectAsAdmin<{ org_id: string }>(
    request,
    "classes",
    `id=eq.${classId}&select=org_id`,
  );
  const title = `Week 7 ${label}`;
  // Tomorrow at 23:00 UTC: 17:00 or 16:00 in Denver, 19:00 or 18:00 in New York.
  const close = new Date();
  close.setUTCDate(close.getUTCDate() + 1);
  close.setUTCHours(23, 0, 0, 0);
  const closesAt = close.toISOString();
  const assignment = await insertAsAdmin<{ id: string }>(request, "assignments", {
    org_id: klass?.org_id,
    class_id: classId,
    bank_id: SAMPLES_BANK,
    title,
    opens_at: new Date(Date.now() - 60_000).toISOString(),
    closes_at: closesAt,
    max_attempts: 1,
    shuffle_options: false,
  });
  return { classPage, classId, student, email, assignmentId: assignment.id, title, closesAt };
}

test("the class's time zone moves the due times on the student home", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const project = testInfo.project.name;
  const shot = (name: string) => `test-results/screenshots/${project}/${name}.png`;
  const { classPage, classId, student, title, closesAt } = await setUp(
    page,
    browser,
    request,
    `zone-${project}`,
  );

  // A new class is on America/Denver, and the student home says so.
  const openList = student.getByRole("list", { name: "Open assignments", exact: true });
  await student.reload();
  await expect(openList.getByRole("listitem").filter({ hasText: title })).toContainText(
    `Closes ${formatInZone(closesAt, "America/Denver")}`,
  );

  // The instructor moves the class to New York from the class page.
  await page.goto(classPage);
  const zone = page.getByRole("combobox", { name: "Time zone", exact: true });
  await expect(zone).toHaveValue("America/Denver");
  await zone.selectOption("America/New_York");
  await page.getByRole("button", { name: "Save time zone", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.reload();
  await expect(zone).toHaveValue("America/New_York");
  const [saved] = await selectAsAdmin<{ time_zone: string }>(
    request,
    "classes",
    `id=eq.${classId}&select=time_zone`,
  );
  expect(saved?.time_zone).toBe("America/New_York");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: shot("class-time-zone"), fullPage: true });

  // Two hours later on the student home, labelled with New York's zone.
  await student.reload();
  const item = openList.getByRole("listitem").filter({ hasText: title });
  await expect(item).toContainText(`Closes ${formatInZone(closesAt, "America/New_York")}`);
  await expect(item.locator("time")).toContainText(/ E[DS]T$/);
  await expectNoAxeViolations(student);
  await student.screenshot({ path: shot("student-home-class-zone"), fullPage: true });

  // The assignment page says the same.
  await item.getByRole("link", { name: title, exact: true }).click();
  await expect(
    student.getByText(`Closes ${formatInZone(closesAt, "America/New_York")}`),
  ).toBeVisible();
});

test("a student removed after attempting stays in the report, under Removed from class", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const project = testInfo.project.name;
  const shot = (name: string) => `test-results/screenshots/${project}/${name}.png`;
  const { classPage, student, email, assignmentId, title } = await setUp(
    page,
    browser,
    request,
    `removed-${project}`,
  );

  // The student takes the assignment and submits it.
  await student.goto(`/learn/assignments/${assignmentId}`);
  await student.getByRole("button", { name: "Start", exact: true }).click();
  await student.getByRole("radio", { name: /Auscultate the lungs/ }).click();
  await expect(student.getByTestId("save-status")).toHaveText("Saved", { timeout: 15_000 });
  await student.getByRole("button", { name: "Submit assignment", exact: true }).click();
  await student.getByRole("button", { name: "Submit now", exact: true }).click();
  await expect(student.getByTestId("submitted-notice")).toBeVisible({ timeout: 15_000 });

  // Then the instructor takes them off the class.
  await page.goto(classPage);
  await page.getByRole("button", { name: `Remove ${email}`, exact: true }).click();
  await page.getByRole("button", { name: "Remove from class", exact: true }).click();
  await expect(page.getByRole("list", { name: "Roster", exact: true })).not.toContainText(email);

  // The report still shows the attempt, in its own group and not in the class's.
  await page.goto(`/author/assignments/${assignmentId}/report`);
  const removed = page.getByRole("region", { name: "Removed from class", exact: true });
  await expect(removed.getByRole("row", { name: new RegExp(`^${email}`) })).toContainText(
    "Submitted",
  );
  await expect(page.getByText("0 submitted · 0 in progress · 0 not started")).toBeVisible();
  // Still open: progress only, for the removed student as for everyone.
  expect(await removed.innerText()).not.toMatch(/%/);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: shot("assignment-report-removed"), fullPage: true });

  // The removed student no longer sees the class or the assignment.
  await student.goto("/learn");
  await expect(student.getByRole("list", { name: "Open assignments", exact: true })).toHaveCount(0);
  await expect(student.getByText(title, { exact: true })).toHaveCount(0);
  const gone = await student.goto(`/learn/assignments/${assignmentId}`);
  expect(gone?.status()).toBe(404);
});
