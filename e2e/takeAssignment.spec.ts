import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { actionBytes, bytesOf, expectKeyless } from "./bytes";
import { latestSignInLink } from "./mailbox";
import { insertAsAdmin, selectAsAdmin, signInAsNewAuthor } from "./signIn";

// #208: a student takes an assignment on a phone: answers save as they go, come back after a
// reload, and submit; and no key, rationale or score reaches the phone before the close. Needs the
// local Supabase stack, like classes.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// The seeded "Samples" bank and case study (supabase/seed.sql), in the first org, which is the org
// signInAsNewAuthor makes its instructor in.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";
const SAMPLE_CASE_STUDY = "00000000-0000-4000-8000-000000000003";
const MC_ITEM = "00000000-0000-4000-8000-000000000100";
const CASE_STEP_6 = "00000000-0000-4000-8000-000000000120";

// The seeded items' own rationales, so the control below can find them where they are allowed to
// be. The key and score markers are e2e/bytes.ts's.
const MC_RATIONALE = "Rapid weight gain with orthopnea suggests fluid overload.";
const MR_RATIONALE = "Tachypnea, hypoxemia, and new confusion indicate worsening gas exchange";
const STEP_6_RATIONALE = "Oxygenation and respiratory rate have improved";

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

async function assign(
  request: Parameters<typeof insertAsAdmin>[0],
  classId: string,
  source: { bank_id: string } | { case_study_id: string },
  title: string,
): Promise<string> {
  const [klass] = await selectAsAdmin<{ org_id: string }>(
    request,
    "classes",
    `id=eq.${classId}&select=org_id`,
  );
  if (!klass) throw new Error(`no class ${classId}`);
  const row = await insertAsAdmin<{ id: string }>(request, "assignments", {
    org_id: klass.org_id,
    class_id: classId,
    ...source,
    title,
    opens_at: new Date(Date.now() - 60_000).toISOString(),
    closes_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    max_attempts: 1,
    shuffle_options: true,
  });
  return row.id;
}

test("a student answers on a phone, reloads to find the answers, and submits", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;
  const shot = (name: string) => `test-results/screenshots/${project}/${name}.png`;

  // An instructor, a class, and a student who joins it from the invite link.
  await signInAsNewAuthor(page, request, `take-${project}`);
  const className = `NUR 310 ${Date.now() % 100_000}`;
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
  const email = `student-take-${project}-${Date.now()}@example.test`;
  const since = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await student.goto(await latestSignInLink(request, email, since));
  await expect(student).toHaveURL(/\/learn$/);

  const bankTitle = `NUR 310 — Week 5 ${project}`;
  const caseTitle = `Hip case ${project}`;
  const bankAssignment = await assign(request, classId, { bank_id: SAMPLES_BANK }, bankTitle);
  const caseAssignment = await assign(
    request,
    classId,
    { case_study_id: SAMPLE_CASE_STUDY },
    caseTitle,
  );
  const bankPath = `/learn/assignments/${bankAssignment}`;

  // The home lists it, linked, with its attempts.
  await student.goto("/learn");
  const open = student.getByRole("list", { name: "Open assignments", exact: true });
  await expect(open.getByRole("listitem").filter({ hasText: bankTitle })).toContainText(
    "1 attempt",
  );
  await open.getByRole("link", { name: bankTitle, exact: true }).click();
  await expect(student).toHaveURL(new RegExp(`${bankPath}$`));
  await expect(
    student.getByRole("heading", { level: 1, name: bankTitle, exact: true }),
  ).toBeVisible();
  const startBytes = await actionBytes(student, () =>
    student.getByRole("button", { name: "Start", exact: true }).click(),
  );
  expectKeyless(startBytes, [MC_RATIONALE, MR_RATIONALE]);

  // Two answers, each saved on its own.
  const status = student.getByTestId("save-status");
  await student.getByRole("radio", { name: /Auscultate the lungs/ }).click();
  await expect(status).toHaveText("Saved", { timeout: 15_000 });
  await student.getByRole("button", { name: "Next item", exact: true }).click();
  await student.getByRole("checkbox", { name: /Respiratory rate 28 breaths/ }).click();
  await expect(status).toHaveText("Saved", { timeout: 15_000 });
  await expect(student.getByTestId("answered-count")).toHaveText(/^2 of \d+ answered$/);
  await expectNoAxeViolations(student);
  await student.screenshot({ path: shot("assignment-taking"), fullPage: true });

  // #146: the bytes the phone is handed carry the items and no key, rationale or score. The
  // control first: the same rationale is in an author's response, so the probe can see it.
  const authorBytes = await bytesOf(page.context(), `/author/items/${MC_ITEM}`);
  expect(authorBytes).toContain(MC_RATIONALE);
  const takingBytes = await bytesOf(phone, bankPath);
  expect(takingBytes).toContain("gaining 2.3 kg");
  expectKeyless(takingBytes, [MC_RATIONALE, MR_RATIONALE]);

  // Close the tab and come back: both answers are there.
  await student.reload();
  await expect(student.getByRole("radio", { name: /Auscultate the lungs/ })).toBeChecked();
  await student.getByRole("button", { name: "Item 2, answered", exact: true }).click();
  await expect(
    student.getByRole("checkbox", { name: /Respiratory rate 28 breaths/ }),
  ).toBeChecked();

  // Submit: "Submitted", and nothing about right or wrong.
  await student.getByRole("button", { name: "Submit assignment", exact: true }).click();
  const submitBytes = await actionBytes(student, () =>
    student.getByRole("button", { name: "Submit now", exact: true }).click(),
  );
  expectKeyless(submitBytes, [MC_RATIONALE, MR_RATIONALE]);
  await expect(student.getByTestId("submitted-notice")).toBeVisible({ timeout: 15_000 });
  await expect(student.getByTestId("attempt-submitted")).toContainText("Submitted");
  await expectNoAxeViolations(student);
  await student.screenshot({ path: shot("assignment-submitted"), fullPage: true });

  // The score exists (the control: the service role reads it) and the phone's page does not carry it.
  const [attempt] = await selectAsAdmin<{ score: number | null; max_score: number | null }>(
    request,
    "assignment_attempts",
    `assignment_id=eq.${bankAssignment}&select=score,max_score`,
  );
  expect(attempt?.score).not.toBeNull();
  expect(attempt?.max_score).not.toBeNull();
  expectKeyless(await bytesOf(phone, bankPath), [MC_RATIONALE, MR_RATIONALE]);

  // A case study: its patient record beside the steps, and no step's key on the wire.
  await student.goto(`/learn/assignments/${caseAssignment}`);
  const caseStartBytes = await actionBytes(student, () =>
    student.getByRole("button", { name: "Start", exact: true }).click(),
  );
  expectKeyless(caseStartBytes, [STEP_6_RATIONALE]);
  await expect(
    student
      .getByRole("button", { name: "Patient record", exact: true })
      .or(student.getByRole("tablist", { name: "Patient record sections", exact: true }))
      .first(),
  ).toBeVisible();
  await expectNoAxeViolations(student);
  await student.screenshot({ path: shot("assignment-case-study"), fullPage: true });
  expect(await bytesOf(page.context(), `/author/items/${CASE_STEP_6}`)).toContain(STEP_6_RATIONALE);
  const caseBytes = await bytesOf(phone, `/learn/assignments/${caseAssignment}`);
  expect(caseBytes).toContain("cs_hip_6");
  expectKeyless(caseBytes, [STEP_6_RATIONALE]);

  await phone.close();
});
