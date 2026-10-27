import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { formatClassCode } from "../src/lib/classes/classCode";
import { findRetiredTerms } from "../src/lib/copy/retiredTerms";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import {
  insertAsAdmin,
  selectAsAdmin,
  signInAsInstructorInEmptyOrg,
  updateAsAdmin,
} from "./signIn";
import { seedQuiz } from "./seedQuiz";
import { skipWelcomes } from "./welcome";

// #417: a quiz sorted into in-quiz folders becomes several quizzes, and questions move from one quiz
// to another. A teacher in a workspace of their own, so every list holds only what this spec makes.
// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const PASSWORD = "correct horse battery";
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
/** The imported questions are the fixture with their own stems; this is its keyed option. */
const RIGHT_ANSWER = "Auscultate the lungs and assess oxygen saturation";

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/** Nothing on the page is wider than the screen. */
async function expectFits(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectGlossaryWords(page: Page): Promise<void> {
  const html = (await page.evaluate(() => document.body.innerHTML)).replace(
    /author-[\w.+-]*(?:@[\w.-]+)?/g,
    "",
  );
  expect(findRetiredTerms(html, await page.title())).toEqual([]);
}

/** Creates a quiz from the library and returns its id. */
async function createQuiz(page: Page, name: string): Promise<string> {
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create quiz", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1) as string;
}

/**
 * Seeds one multiple-choice question per stem into the open quiz, then publishes them with the
 * local secret key (setup this spec is not about). Returns each question's id by its stem.
 */
async function seedPublished(
  page: Page,
  request: APIRequestContext,
  bankId: string,
  stems: readonly string[],
): Promise<Map<string, string>> {
  const items = stems.map((value, index) => ({
    ...FIXTURES.multiple_choice.canonical,
    id: `move-${index + 1}`,
    stem: { kind: "markdown", value },
  }));
  await seedQuiz(page, request, JSON.stringify({ format: "learn.v1", items }));
  await expect(
    page.getByRole("list", { name: "Questions" }).getByRole("link", { name: stems[0] }),
  ).toBeVisible();
  const rows = await updateAsAdmin<{ id: string; content: { stem: { value: string } } }>(
    request,
    "items",
    `bank_id=eq.${bankId}`,
    { status: "published" },
  );
  return new Map(rows.map((row) => [row.content.stem.value, row.id]));
}

/** The question ids a live session was given when it started, read with the local secret key. */
async function sessionItems(page: Page, request: APIRequestContext): Promise<string[]> {
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("join-code")).toBeVisible();
  const sessionId = new URL(page.url()).pathname.split("/").at(-1);
  const [session] = await selectAsAdmin<{ item_set: string[] }>(
    request,
    "sessions",
    `id=eq.${sessionId}&select=item_set`,
  );
  return [...(session?.item_set ?? [])].sort();
}

const folderNav = (page: Page) => page.getByRole("navigation", { name: "Folders", exact: true });

test("a quiz with two folders inside it becomes two quizzes, each running only its own questions", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;
  const shoot = (name: string) =>
    page.screenshot({ path: `test-results/screenshots/${project}/${name}.png`, fullPage: true });
  const orgId = await signInAsInstructorInEmptyOrg(page, request, `split-${project}`);

  const original = await createQuiz(page, "Med-Surg term");
  const cardiacStems = ["Split cardiac one", "Split cardiac two"];
  const renalStems = ["Split renal one"];
  const ids = await seedPublished(page, request, original, [...cardiacStems, ...renalStems]);
  const idsOf = (stems: string[]) => stems.map((stem) => ids.get(stem) as string).sort();

  // The quiz as it was before #411: two folders inside it, each holding its questions.
  for (const [name, stems] of [
    ["Cardiac", cardiacStems],
    ["Renal", renalStems],
  ] as const) {
    const folder = await insertAsAdmin<{ id: string }>(request, "bank_folders", {
      bank_id: original,
      org_id: orgId,
      name,
    });
    await updateAsAdmin(request, "items", `id=in.(${idsOf([...stems]).join(",")})`, {
      folder_id: folder.id,
    });
  }
  await page.reload();

  // Open Cardiac and turn it into a quiz. The confirm step comes first, and changes nothing.
  await folderNav(page).getByRole("link", { name: "Cardiac", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cardiac", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Turn into a quiz", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: 'Turn "Cardiac" into a quiz?' });
  await expect(confirm).toContainText('Creates the quiz "Cardiac" with this folder\'s contents.');
  // Nothing uses this quiz yet, so nothing is listed as staying with it.
  await expect(
    confirm.getByRole("list", { name: "What stays with this quiz", exact: true }),
  ).toHaveCount(0);
  await expectNoAxeViolations(page);
  await expectGlossaryWords(page);
  await shoot("turn-folder-confirm");
  await confirm.getByRole("button", { name: "Turn into a quiz", exact: true }).click();

  // The new quiz opens: the folder's two questions, and no folders inside it.
  await expect(page.getByRole("heading", { level: 1, name: "Cardiac", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(original));
  await expect(
    page.getByRole("list", { name: "Questions" }).getByRole("link", { name: /^Split / }),
  ).toHaveCount(2);
  await expect(folderNav(page)).toHaveCount(0);
  await expectNoAxeViolations(page);
  await expectFits(page);
  await shoot("turned-into-quiz");

  // Its live session holds only its own questions.
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  expect(await sessionItems(page, request)).toEqual(idsOf(cardiacStems));

  // Renal is the original quiz's last folder. Once it is a quiz, the folder controls go.
  await page.goto(`/author/banks/${original}`);
  await folderNav(page).getByRole("link", { name: "Renal", exact: true }).click();
  await page.getByRole("button", { name: "Turn into a quiz", exact: true }).click();
  await page
    .getByRole("dialog", { name: 'Turn "Renal" into a quiz?' })
    .getByRole("button", { name: "Turn into a quiz", exact: true })
    .click();
  // The folder's page has the same heading, so wait for the new quiz's address first.
  await expect(page).not.toHaveURL(new RegExp(original));
  await expect(page.getByRole("heading", { level: 1, name: "Renal", exact: true })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Questions" }).getByRole("link", { name: /^Split / }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  expect(await sessionItems(page, request)).toEqual(idsOf(renalStems));

  await page.goto(`/author/banks/${original}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Med-Surg term", exact: true }),
  ).toBeVisible();
  await expect(folderNav(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Turn into a quiz" })).toHaveCount(0);

  // The library lists all three, side by side.
  await page.goto("/author");
  const quizzes = page.getByRole("list", { name: "Quizzes", exact: true });
  for (const name of ["Med-Surg term", "Cardiac", "Renal"]) {
    await expect(quizzes.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
});

test("two questions move to another quiz, and an assignment made before the move still opens and scores", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;
  const stamp = `${Date.now() % 1_000_000}`;
  const shoot = (name: string) =>
    page.screenshot({ path: `test-results/screenshots/${project}/${name}.png`, fullPage: true });
  const orgId = await signInAsInstructorInEmptyOrg(page, request, `move-${project}`);

  await createQuiz(page, "Week 6");
  const week5 = await createQuiz(page, "Week 5");
  const stems = ["Move me first", "Move me second", "Stay here"];
  const ids = await seedPublished(page, request, week5, stems);

  // A class, and an assignment of Week 5 made now, before anything moves.
  const code = Array.from(
    randomBytes(8),
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join("");
  await insertAsAdmin(request, "classes", {
    org_id: orgId,
    name: `NUR 417 ${stamp}`,
    invite_token: randomBytes(24).toString("base64url"),
    join_code: code,
  });
  const [klass] = await selectAsAdmin<{ id: string }>(
    request,
    "classes",
    `join_code=eq.${code}&select=id`,
  );
  const title = `Week 5 assignment ${stamp}`;
  const assignment = await insertAsAdmin<{ id: string; item_set: string[] }>(
    request,
    "assignments",
    {
      org_id: orgId,
      class_id: klass?.id,
      bank_id: week5,
      title,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      closes_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      max_attempts: 1,
      shuffle_options: false,
    },
  );
  expect(assignment.item_set).toHaveLength(3);

  // Move the first two to Week 6. The confirm step names the assignment that keeps them.
  await page.reload();
  for (const stem of stems.slice(0, 2)) {
    await page.getByRole("checkbox", { name: `Select ${stem}`, exact: true }).check();
  }
  await page
    .getByRole("combobox", { name: "Move to another quiz", exact: true })
    .selectOption({ label: "Week 6" });
  await page.getByRole("button", { name: "Move to quiz", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Move 2 questions to Week 6?" });
  await expect(
    confirm.getByRole("list", { name: "What stays with this quiz", exact: true }),
  ).toContainText("Its assignment keeps the questions it was given.");
  await expectNoAxeViolations(page);
  await expectGlossaryWords(page);
  await expectFits(page);
  await shoot("move-to-quiz-confirm");
  await confirm.getByRole("button", { name: "Move", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Moved 2 questions to Week 6." }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Questions" }).getByRole("link", { name: /^(Move|Stay) / }),
  ).toHaveCount(1);
  await shoot("moved-to-quiz");

  // The same ids, now in Week 6.
  const moved = await selectAsAdmin<{ bank_id: string }>(
    request,
    "items",
    `id=in.(${ids.get(stems[0]!)},${ids.get(stems[1]!)})&select=bank_id`,
  );
  expect(moved).toHaveLength(2);
  expect(new Set(moved.map((row) => row.bank_id)).size).toBe(1);
  expect(moved[0]?.bank_id).not.toBe(week5);

  // A student joins the class, opens the assignment, answers its first question and submits.
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const phone = await browser.newContext({ viewport, isMobile, hasTouch, reducedMotion: "reduce" });
  const student = await phone.newPage();
  await skipWelcomes(student);
  await student.goto("/sign-up");
  await student.getByRole("radio", { name: /^I am a student/ }).check();
  await student.getByRole("textbox", { name: "Your name", exact: true }).fill(`Ari ${stamp}`);
  await student
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill(`move-${project}-${Date.now()}@example.test`);
  await student.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await student.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(student).toHaveURL(/\/welcome$/);
  await student
    .getByRole("textbox", { name: "Class code", exact: true })
    .fill(formatClassCode(code));
  await student.getByRole("button", { name: "Join the class", exact: true }).click();
  await expect(student).toHaveURL(/\/learn$/);

  await student.goto(`/learn/assignments/${assignment.id}`);
  await expect(student.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
  await student.getByRole("button", { name: "Start", exact: true }).click();
  await student.getByRole("radio", { name: RIGHT_ANSWER }).click();
  await expect(student.getByTestId("save-status")).toHaveText("Saved", { timeout: 15_000 });
  await student.getByRole("button", { name: "Submit assignment", exact: true }).click();
  await student.getByRole("button", { name: "Submit now", exact: true }).click();
  await expect(student.getByTestId("submitted-notice")).toBeVisible({ timeout: 15_000 });

  // Scored against the three questions it was given, two of which are in Week 6 now.
  const [attempt] = await selectAsAdmin<{ score: number | null; max_score: number | null }>(
    request,
    "assignment_attempts",
    `assignment_id=eq.${assignment.id}&select=score,max_score`,
  );
  expect(attempt?.max_score).toBe(3);
  expect(attempt?.score).toBe(1);
  await phone.close();
});
