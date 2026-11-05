import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { latestSignInLink, openSignInLink } from "./mailbox";
import { createAccountWithoutRole, insertAsAdmin, selectAsAdmin, updateAsAdmin } from "./signIn";
import { skipWelcomes } from "./welcome";

const CLASS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// #521, ADR 0016 "A lapsed workspace is read-only": with billing enforced in the app
// (BILLING_ENFORCED=true) and in the database (private.billing_config.enforced), a teacher whose
// workspace has no grant and no subscription reads everything, is refused a new quiz with one
// sentence and the way to Billing, and their student still finishes an open assignment.
//
// The app's switch is the server's environment, which cannot change per test, and the database's
// is one row every test shares. So this spec does not run in the main e2e step: CI runs it on its
// own afterwards (.github/workflows/ci.yml, "Billing enforcement e2e"), one worker, against a
// server started with BILLING_ENFORCED=true, with billing_config.enforced set true before and
// false after. Both ways for every write are held by supabase/tests/database/
// billing_enforcement.test.sql and the app's gate by src/app/author/readOnlyGate.test.ts.
test.skip(
  process.env.E2E_AUTH !== "1" || process.env.E2E_BILLING_ENFORCED !== "1",
  "set E2E_AUTH=1 and E2E_BILLING_ENFORCED=1 against a server with BILLING_ENFORCED=true",
);

// The seeded sample question (supabase/seed.sql), copied into the lapsed workspace's quiz.
const SAMPLE_MC_ITEM = "00000000-0000-4000-8000-000000000100";
const READ_ONLY_HEADING = "Your workspace is read-only";

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shoot(page: Page, testInfo: TestInfo, step: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/billing-read-only-${step}.png`,
    fullPage: true,
  });
}

function address(label: string, project: string): string {
  return `${label}-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function signInByLink(
  page: Page,
  request: Parameters<typeof insertAsAdmin>[0],
  email: string,
) {
  await page.goto("/sign-in");
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Sign in with an emailed link instead", exact: true })
    .click();
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email", exact: true })).toBeVisible();
  await openSignInLink(page, await latestSignInLink(request, email, since));
}

test("a lapsed teacher reads but cannot create, and their student finishes an open assignment", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;

  // A workspace the teacher started, made after billing shipped: no grant, no subscription.
  const teacherEmail = address("lapsed-teacher", project);
  const teacherId = await createAccountWithoutRole(request, teacherEmail);
  const org = await insertAsAdmin<{ id: string }>(request, "orgs", {
    name: `Lapsed ${project}`,
    self_registered: true,
  });
  await updateAsAdmin(request, "profiles", `id=eq.${teacherId}`, {
    org_id: org.id,
    role: "instructor",
  });
  await updateAsAdmin(request, "orgs", `id=eq.${org.id}`, { founder_id: teacherId });

  // What it made before it lapsed, written with the secret key: a quiz with one published
  // question, a class with a student in it, and an assignment open for another hour.
  const quizName = `Cardiac ${project} ${Date.now() % 100_000}`;
  const bank = await insertAsAdmin<{ id: string }>(request, "item_banks", {
    org_id: org.id,
    name: quizName,
    created_by: teacherId,
  });
  const [sample] = await selectAsAdmin<Record<string, unknown>>(
    request,
    "items",
    `id=eq.${SAMPLE_MC_ITEM}&select=type,cjmm_step,content,answer_key,rationale,scoring`,
  );
  if (!sample) throw new Error("the seeded sample question is missing");
  await insertAsAdmin(request, "items", {
    ...sample,
    bank_id: bank.id,
    org_id: org.id,
    status: "published",
    version: 1,
    created_by: teacherId,
  });
  // The service role may not call private.new_invite_token(), so the class brings its own
  // token and code, as classProgress.spec.ts writes one.
  const klass = await insertAsAdmin<{ id: string }>(request, "classes", {
    org_id: org.id,
    name: `NUR 521 ${project}`,
    invite_token: randomBytes(24).toString("base64url"),
    join_code: Array.from(
      randomBytes(8),
      (byte) => CLASS_CODE_ALPHABET[byte % CLASS_CODE_ALPHABET.length],
    ).join(""),
  });
  const studentEmail = address("lapsed-student", project);
  const studentId = await createAccountWithoutRole(request, studentEmail);
  await updateAsAdmin(request, "profiles", `id=eq.${studentId}`, {
    org_id: org.id,
    role: "student",
  });
  await insertAsAdmin(request, "class_members", { class_id: klass.id, profile_id: studentId });
  const title = `Week 5 ${project}`;
  const assignment = await insertAsAdmin<{ id: string }>(request, "assignments", {
    org_id: org.id,
    class_id: klass.id,
    bank_id: bank.id,
    title,
    opens_at: new Date(Date.now() - 60_000).toISOString(),
    closes_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    max_attempts: 1,
  });

  // The teacher: the library and the quiz still read.
  await skipWelcomes(page);
  await signInByLink(page, request, teacherEmail);
  await expect(page).toHaveURL(/\/author$/);
  await expect(page.getByText(quizName).first()).toBeVisible();
  await page.goto(`/author/banks/${bank.id}`);
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();

  // Creating a quiz is refused on the server: one sentence and the way to Billing.
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(`Refused ${project}`);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page).toHaveURL(/\/author\/read-only\?next=/);
  await expect(page.getByRole("heading", { level: 1, name: READ_ONLY_HEADING })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Your workspace has no subscription, so nothing can be created or changed until you subscribe in Billing.",
  );
  await expect(page.getByRole("link", { name: "Go to Billing", exact: true })).toHaveAttribute(
    "href",
    "/author/workspace",
  );
  await expectNoAxeViolations(page);
  await expectNoSidewaysScroll(page);
  await shoot(page, testInfo, "refused");

  // Nothing was made.
  const refused = await selectAsAdmin<{ id: string }>(
    request,
    "item_banks",
    `org_id=eq.${org.id}&name=eq.${encodeURIComponent(`Refused ${project}`)}&select=id`,
  );
  expect(refused).toEqual([]);

  // Billing still opens.
  await page.getByRole("link", { name: "Go to Billing", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/workspace$/);
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();

  // The student finishes the open assignment, and sees nothing about billing.
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const phone = await browser.newContext({ viewport, isMobile, hasTouch, reducedMotion: "reduce" });
  const student = await phone.newPage();
  await skipWelcomes(student);
  await signInByLink(student, request, studentEmail);
  await expect(student).toHaveURL(/\/learn$/);
  await student.goto(`/learn/assignments/${assignment.id}`);
  await expect(student.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
  await student.getByRole("button", { name: "Start", exact: true }).click();
  await student.getByRole("radio").first().click();
  await expect(student.getByTestId("save-status")).toHaveText("Saved", { timeout: 15_000 });
  await student.getByRole("button", { name: "Submit assignment", exact: true }).click();
  await student.getByRole("button", { name: "Submit now", exact: true }).click();
  await expect(student.getByTestId("submitted-notice")).toBeVisible({ timeout: 15_000 });
  await expect(student.getByTestId("attempt-submitted")).toContainText("Submitted");
  await expect(student.locator("body")).not.toContainText(/subscription|billing|read-only/i);
  await phone.close();
});
