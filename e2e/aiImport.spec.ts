import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import { selectAsAdmin, signInAsInstructorInEmptyOrg, updateAsAdmin } from "./signIn";

// Needs the local Supabase stack (with Storage) and a build with AI_IMPORT_FAKE=1, which swaps
// Claude for the fake client (src/lib/aiImport/fakeClaude.ts): no live API call is ever made.
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
