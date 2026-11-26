import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page, type Route } from "@playwright/test";
import {
  insertAsAdmin,
  selectAsAdmin,
  signInAsInstructorInEmptyOrg,
  updateAsAdmin,
} from "./signIn";

// Needs the local Supabase stack (with Storage) and a build with AI_IMPORT_FAKE=1, which swaps
// Claude for the fake client (src/lib/ai/fakeClaude.ts): no live API call is ever made.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// Playwright runs from the repo root, and the e2e files are not ES modules (no import.meta).
const CORPUS = path.resolve("test", "ai-import", "corpus");

/** Two fictional corpus documents (#339), uploaded as a teacher would pick them. */
const corpusFile = (name: string) => ({
  name,
  mimeType: "text/markdown",
  buffer: readFileSync(path.join(CORPUS, name)),
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("a teacher uploads two documents, reloads while they are read, and sees them reach review", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  // A workspace of its own, with AI import turned on as the owner does for an invited workspace.
  const orgId = await signInAsInstructorInEmptyOrg(page, request, `ai-${testInfo.project.name}`);
  await updateAsAdmin(request, "orgs", `id=eq.${orgId}`, { ai_import_enabled: true });

  const quizName = `AI import ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(quizName);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();

  await page.getByRole("link", { name: "Import with AI", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Import with AI" })).toBeVisible();
  await expect(page.getByText("About 40 documents left this month.")).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-upload.png`, fullPage: true });

  // Hold every extract request in the browser, so the page stops between reading and extracting.
  const held: Route[] = [];
  await page.route("**/api/ai-import/extract", (route) => {
    held.push(route);
  });

  await page
    .getByLabel("Documents")
    .setInputFiles([corpusFile("01-med-surg-review.md"), corpusFile("03-answers-at-the-back.md")]);
  // Nothing is sent before the rights confirmation.
  await page.getByRole("button", { name: "Upload and read" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Confirm you may use" })).toBeVisible();
  await page.getByRole("checkbox", { name: /I may use this content in my course/ }).check();
  await page.getByRole("button", { name: "Upload and read" }).click();

  const files = page.getByRole("list", { name: "Files" });
  await expect(files.getByRole("listitem")).toHaveCount(2);
  // Extracting starts only once every part of every file is read.
  await expect.poll(() => held.length, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect(files.getByText(/^Reading: (\d+) of \d+ parts? read\.$/)).toHaveCount(2);
  await expect(page).toHaveURL(/\?batch=/);
  await page.screenshot({ path: `${shots}/ai-import-reading.png`, fullPage: true });

  // Closing the tab mid-way: the reload carries on from the batch as stored.
  await page.unroute("**/api/ai-import/extract");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ready for review" })).toBeVisible({
    timeout: 60_000,
  });
  const done = page
    .getByRole("list", { name: "Files" })
    .getByText(/^Done: \d+ questions? found\.$/);
  await expect(done).toHaveCount(2);
  await expect(page.getByRole("status")).toContainText("waiting for review");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-review.png`, fullPage: true });

  // The batch is in review, its chunks read once each, and questions staged from both files.
  const batchId = new URL(page.url()).searchParams.get("batch");
  const [batch] = await selectAsAdmin<{ status: string }>(
    request,
    "ai_import_batches",
    `select=status&id=eq.${batchId}`,
  );
  expect(batch?.status).toBe("review");
  const chunks = await selectAsAdmin<{ status: string; attempts: number }>(
    request,
    "ai_import_chunks",
    `select=status,attempts&batch_id=eq.${batchId}`,
  );
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.every((chunk) => chunk.status === "done" && chunk.attempts === 1)).toBe(true);
  const entries = await selectAsAdmin<{ position: number }>(
    request,
    "ai_import_entries",
    `select=position&batch_id=eq.${batchId}`,
  );
  expect(entries.some((entry) => entry.position < 1000)).toBe(true);
  expect(entries.some((entry) => entry.position >= 1000)).toBe(true);
});

/** A teacher in a workspace of their own, with AI import on, on a new quiz's page. */
async function teacherWithQuiz(page: Page, request: APIRequestContext, label: string) {
  const orgId = await signInAsInstructorInEmptyOrg(page, request, label);
  await updateAsAdmin(request, "orgs", `id=eq.${orgId}`, { ai_import_enabled: true });
  const quizName = `Dead ends ${label} ${Date.now()}`;
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(quizName);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();
  const bankId = new URL(page.url()).pathname.split("/").at(-1)!;
  return { orgId, bankId, quizName };
}

/** What the parse route answers for a part that has used its tries (`spent`). */
const SPENT = {
  status: 409,
  contentType: "application/json",
  body: JSON.stringify({
    ok: false,
    code: "spent",
    message: "This part failed too many times. Remove the file, or discard this import.",
  }),
};

// #591: one file that cannot be read no longer holds the others back.
test("a teacher removes a file that failed and reviews the other", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const { bankId } = await teacherWithQuiz(page, request, `rm-${testInfo.project.name}`);
  const failing = "01-med-surg-review.md";
  const kept = "03-answers-at-the-back.md";

  // Every part of the first file fails for good, as the browser hears it; the second is read by
  // the fake client. The first file is the one removed, so the file kept is the one whose
  // questions sit after it (from 1000): the case where a place must not move.
  const names = new Map<string, string>();
  await page.route("**/api/ai-import/parse", async (route) => {
    const { fileId } = route.request().postDataJSON() as { fileId: string };
    if (!names.has(fileId)) {
      const [file] = await selectAsAdmin<{ original_name: string }>(
        request,
        "ai_import_files",
        `select=original_name&id=eq.${fileId}`,
      );
      names.set(fileId, file?.original_name ?? "");
    }
    if (names.get(fileId) === failing) await route.fulfill(SPENT);
    else await route.continue();
  });

  await page.goto(`/author/banks/${bankId}/ai-import`);
  await page.getByLabel("Documents").setInputFiles([corpusFile(failing), corpusFile(kept)]);
  // What was chosen is listed before anything is sent.
  const chosen = page.getByRole("list", { name: "Chosen files" });
  await expect(chosen.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("checkbox", { name: /I may use this content in my course/ }).check();
  await page.getByRole("button", { name: "Upload and read" }).click();

  const files = page.getByRole("list", { name: "Files" });
  await expect(files.getByText("This part failed too many times.")).toBeVisible({
    timeout: 60_000,
  });
  // The other file is read to the end; only the finish waits on the failed one.
  await expect(files.getByText(/^Done: \d+ questions? found\.$/)).toBeVisible({ timeout: 90_000 });
  const remove = page.getByRole("button", { name: `Remove ${failing}` });
  await expect(remove).toBeEnabled({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: `Remove ${kept}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Discard this import" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-failed-file.png`, fullPage: true });

  const batchId = new URL(page.url()).searchParams.get("batch");
  const [removedFile] = await selectAsAdmin<{ id: string }>(
    request,
    "ai_import_files",
    `select=id&batch_id=eq.${batchId}&original_name=eq.${failing}`,
  );
  expect(removedFile).toBeTruthy();

  await remove.click();
  await expect(page.getByRole("heading", { name: "Ready for review" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("list", { name: "Files" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Files" })).not.toContainText(failing);

  // The removed file left nothing behind, and the kept file's questions are still its own.
  expect(
    await selectAsAdmin(
      request,
      "ai_import_chunks",
      `select=id&batch_id=eq.${batchId}&file_id=eq.${removedFile!.id}`,
    ),
  ).toEqual([]);
  const entries = await selectAsAdmin<{ position: number }>(
    request,
    "ai_import_entries",
    `select=position&batch_id=eq.${batchId}`,
  );
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.every((entry) => entry.position >= 1000 && entry.position < 2000)).toBe(true);

  await page.getByRole("link", { name: "Review the questions" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Review AI import" })).toBeVisible();
  await expect(page.getByRole("region", { name: kept })).toBeVisible();
  await expect(page.getByRole("region", { name: failing })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test("a teacher discards an import from the upload page and lands on the quiz", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const { bankId, quizName } = await teacherWithQuiz(page, request, `dis-${testInfo.project.name}`);
  await page.route("**/api/ai-import/parse", (route) => route.fulfill(SPENT));

  await page.goto(`/author/banks/${bankId}/ai-import`);
  await page.getByLabel("Documents").setInputFiles(corpusFile("01-med-surg-review.md"));
  await page.getByRole("checkbox", { name: /I may use this content in my course/ }).check();
  await page.getByRole("button", { name: "Upload and read" }).click();
  await expect(page.getByText("This part failed too many times.")).toBeVisible({
    timeout: 60_000,
  });
  const batchId = new URL(page.url()).searchParams.get("batch");
  expect(batchId).toBeTruthy();

  await page.getByRole("button", { name: "Discard this import" }).click();
  const dialog = page.getByRole("dialog", { name: "Discard this import?" });
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-upload-discard.png` });
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();
  expect(await selectAsAdmin(request, "ai_import_batches", `select=id&id=eq.${batchId}`)).toEqual(
    [],
  );
  // Nothing is left to come back to.
  await expect(page.getByRole("list", { name: "Imports not finished" })).toHaveCount(0);
});

test("the quiz page leads back to an import left in review", async ({
  page,
  request,
}, testInfo) => {
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const { orgId, bankId } = await teacherWithQuiz(page, request, `back-${testInfo.project.name}`);
  const batch = await insertAsAdmin<{ id: string }>(request, "ai_import_batches", {
    org_id: orgId,
    bank_id: bankId,
    status: "review",
  });
  await insertAsAdmin(request, "ai_import_entries", {
    batch_id: batch.id,
    org_id: orgId,
    position: 0,
    kind: "item",
    type: "multiple_choice",
    status: "needs_fix",
    reasons: ["needs_fix: Fictional test entry."],
    source_excerpt: "A fictional question left in review.",
  });

  // As after closing the tab: the quiz page, with no address to go by.
  await page.goto(`/author/banks/${bankId}`);
  const open = page.getByRole("list", { name: "Imports not finished" });
  await expect(open).toContainText("An import is waiting for review.");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-quiz-open-import.png`, fullPage: true });
  await open.getByRole("link", { name: "Review 1 question" }).click();
  await expect(page).toHaveURL(new RegExp(`/ai-import/${batch.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Review AI import" })).toBeVisible();
});

test("the quiz page offers no AI import to a workspace that has it off", async ({
  page,
  request,
}, testInfo) => {
  await signInAsInstructorInEmptyOrg(page, request, `ai-off-${testInfo.project.name}`);
  const quizName = `No AI ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(quizName);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();
  await expect(page.getByRole("link", { name: "Import with AI" })).toHaveCount(0);
  const response = await page.goto(`${page.url()}/ai-import`);
  expect(response?.status()).toBe(404);
});
