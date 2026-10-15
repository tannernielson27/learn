import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { wireText } from "./bytes";
import { latestSignInLink, openSignInLink } from "./mailbox";
import {
  createAccountWithoutRole,
  insertAsAdmin,
  selectAsAdmin,
  signInAsInstructorInEmptyOrg,
  uniqueEmail,
  updateAsAdmin,
} from "./signIn";

// #346: the review screen for an AI import batch. Needs the local Supabase stack (with Storage)
// and a build with AI_IMPORT_FAKE=1 (src/lib/aiImport/fakeClaude.ts): no live API call is made.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const CORPUS = path.resolve("test", "ai-import", "corpus");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

/** A teacher in a workspace of their own, with AI import on, on a new quiz's page. */
async function teacherWithQuiz(page: Page, request: APIRequestContext, label: string) {
  const orgId = await signInAsInstructorInEmptyOrg(page, request, label);
  await updateAsAdmin(request, "orgs", `id=eq.${orgId}`, { ai_import_enabled: true });
  const quizName = `Review ${label} ${Date.now()}`;
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(quizName);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();
  const bankId = new URL(page.url()).pathname.split("/").at(-1)!;
  return { orgId, bankId, quizName };
}

interface EntryRow {
  id: string;
  position: number;
  type: string | null;
  status: string;
}

const entryCard = (page: Page, heading: string) =>
  page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

test("a teacher reviews an import: four statuses, a drop and a change of type", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const { bankId } = await teacherWithQuiz(page, request, `rv-${testInfo.project.name}`);

  await page.goto(`/author/banks/${bankId}/ai-import`);
  await page.getByLabel("Documents").setInputFiles({
    name: "01-med-surg-review.md",
    mimeType: "text/markdown",
    buffer: readFileSync(path.join(CORPUS, "01-med-surg-review.md")),
  });
  await page.getByRole("checkbox", { name: /I may use this content in my course/ }).check();
  await page.getByRole("button", { name: "Upload and read" }).click();
  await expect(page.getByRole("heading", { name: "Ready for review" })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("link", { name: "Review the questions" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Review AI import" })).toBeVisible();
  const batchId = new URL(page.url()).pathname.split("/").at(-1)!;

  // The fake client reads every question as multiple choice. Give four of them the statuses the
  // real pipeline gives (#343), as the database would hold them.
  const entries = await selectAsAdmin<EntryRow>(
    request,
    "ai_import_entries",
    `select=id,position,type,status&batch_id=eq.${batchId}&order=position`,
  );
  expect(entries.length).toBeGreaterThanOrEqual(4);
  const [first, second, third, fourth] = entries as [EntryRow, EntryRow, EntryRow, EntryRow];
  await updateAsAdmin(request, "ai_import_entries", `id=eq.${first.id}`, { status: "ready" });
  await updateAsAdmin(request, "ai_import_entries", `id=eq.${second.id}`, {
    status: "needs_answer",
    reasons: [
      "needs_answer: The source marks no answer. Add the key before this question can be imported.",
    ],
  });
  await updateAsAdmin(request, "ai_import_entries", `id=eq.${third.id}`, {
    status: "needs_fix",
    item: null,
    reasons: [
      "unmarked_key: The AI marked an answer this part of the document does not show, so the question was not converted. Check the key against the document.",
    ],
  });
  await updateAsAdmin(request, "ai_import_entries", `id=eq.${fourth.id}`, {
    status: "not_importable",
    type: null,
    item: null,
    reasons: ["not_ngn: An open discussion prompt."],
  });
  await page.reload();

  for (const status of ["Ready", "Needs an answer", "Needs a fix", "Not importable"]) {
    await expect(
      page.getByTestId("entry-status").filter({ hasText: status }).first(),
    ).toBeVisible();
  }
  const importButton = page.getByTestId("import-button");
  const kept = entries.length - 1; // all but the one that is not importable
  await expect(importButton).toHaveText(`Import ${kept} questions`);
  await expect(importButton).toBeDisabled();
  await expect(page.getByText(/needs? an answer\. Add/)).toBeVisible();

  // The source, side by side from 1024px.
  const firstCard = entryCard(page, "Question 1");
  await firstCard.getByRole("button", { name: "Show source" }).click();
  await expect(firstCard.getByRole("region", { name: "Question 1, source" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-review-screen.png`, fullPage: true });

  // Dropping a question takes it out of the count.
  await firstCard.getByRole("button", { name: "Drop" }).click();
  await expect(importButton).toHaveText(`Import ${kept - 1} questions`);
  await expect(firstCard.getByRole("button", { name: "Restore" })).toBeVisible();
  const [dropped] = await selectAsAdmin<EntryRow>(
    request,
    "ai_import_entries",
    `select=status&id=eq.${first.id}`,
  );
  expect(dropped?.status).toBe("dropped");

  // Changing a type reads the question again (through the fake client) and says what it costs.
  const thirdCard = entryCard(page, "Question 3");
  await expect(
    thirdCard.getByText(/counts towards this month's AI import allowance/),
  ).toBeVisible();
  await thirdCard.getByRole("combobox", { name: "Change type" }).selectOption("bowtie");
  await thirdCard.getByRole("button", { name: "Read again as this type" }).click();
  await expect(thirdCard.getByText("Read again as Bowtie.")).toBeVisible({ timeout: 60_000 });
  await expect(thirdCard.getByText(/^Bowtie/)).toBeVisible();
  const [retyped] = await selectAsAdmin<EntryRow>(
    request,
    "ai_import_entries",
    `select=type&id=eq.${third.id}`,
  );
  expect(retyped?.type).toBe("bowtie");
  await page.screenshot({ path: `${shots}/ai-import-review-changed.png`, fullPage: true });
});

/** A student account signed in through the emailed link, in a browser of its own. */
async function signedInStudent(browser: Browser, request: APIRequestContext, label: string) {
  const email = uniqueEmail(label);
  const userId = await createAccountWithoutRole(request, email);
  await updateAsAdmin(request, "profiles", `id=eq.${userId}`, { role: "student" });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Sign in with an emailed link instead", exact: true })
    .click();
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await openSignInLink(page, await latestSignInLink(request, email, since));
  return { context, page };
}

test("the review page and its change of type reach nobody outside the batch's workspace", async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.slow();
  const label = `rvb-${testInfo.project.name}`;
  const { orgId, bankId } = await teacherWithQuiz(page, request, label);
  const marker = `review-marker-${Date.now()}`;
  const batch = await insertAsAdmin<{ id: string }>(request, "ai_import_batches", {
    org_id: orgId,
    bank_id: bankId,
    status: "review",
  });
  const entry = await insertAsAdmin<{ id: string }>(request, "ai_import_entries", {
    batch_id: batch.id,
    org_id: orgId,
    position: 0,
    kind: "item",
    type: "multiple_choice",
    status: "needs_fix",
    reasons: ["needs_fix: Fictional test entry."],
    source_excerpt: marker,
  });
  const reviewPath = `/author/banks/${bankId}/ai-import/${batch.id}`;

  // Control: the batch's own teacher is handed the excerpt, so the grep below can match.
  const own = await page.context().request.get(reviewPath);
  expect(own.status()).toBe(200);
  expect(wireText(await own.text())).toContain(marker);

  // A teacher of another workspace, with AI import on: not found, and none of it.
  const outsider = await browser.newContext();
  const outsiderPage = await outsider.newPage();
  const otherOrg = await signInAsInstructorInEmptyOrg(outsiderPage, request, `${label}-other`);
  await updateAsAdmin(request, "orgs", `id=eq.${otherOrg}`, { ai_import_enabled: true });
  const outsiderGet = await outsider.request.get(reviewPath);
  expect(outsiderGet.status()).toBe(404);
  expect(wireText(await outsiderGet.text())).not.toContain(marker);
  const outsiderRetype = await outsider.request.post("/api/ai-import/retype", {
    data: { batchId: batch.id, entryId: entry.id, version: 1, type: "bowtie" },
  });
  expect(outsiderRetype.status()).toBe(404);
  expect(await outsiderRetype.text()).not.toContain(marker);
  await outsider.close();

  // A student is sent to the student home, as from every author page, with none of it.
  const student = await signedInStudent(browser, request, `${label}-student`);
  const studentGet = await student.context.request.get(reviewPath);
  expect(new URL(studentGet.url()).pathname).not.toMatch(/^\/author/);
  expect(wireText(await studentGet.text())).not.toContain(marker);
  const studentRetype = await student.context.request.post("/api/ai-import/retype", {
    data: { batchId: batch.id, entryId: entry.id, version: 1, type: "bowtie" },
  });
  expect(studentRetype.status()).toBe(403);
  await student.context.close();

  // Nothing above changed the entry.
  const [after] = await selectAsAdmin<{ version: number; type: string }>(
    request,
    "ai_import_entries",
    `select=version,type&id=eq.${entry.id}`,
  );
  expect(after).toEqual({ version: 1, type: "multiple_choice" });
});
