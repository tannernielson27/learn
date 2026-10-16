import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  insertAsAdmin,
  selectAsAdmin,
  signInAsInstructorInEmptyOrg,
  updateAsAdmin,
} from "./signIn";

// #348: import a reviewed AI import batch into its quiz, or discard it. Needs the local Supabase
// stack (with Storage) and a build with AI_IMPORT_FAKE=1: no live API call is made.
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
  const quizName = `Commit ${label} ${Date.now()}`;
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(quizName);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();
  const bankId = new URL(page.url()).pathname.split("/").at(-1)!;
  return { orgId, bankId, quizName };
}

/** An uploaded object, fetched with the local secret key: true while it is still in Storage. */
async function objectExists(request: APIRequestContext, storagePath: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  const got = await request.get(`${url}/storage/v1/object/ai-imports/${storagePath}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return got.ok();
}

test("a teacher imports a reviewed batch into the quiz, and its files are deleted", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const { bankId, quizName } = await teacherWithQuiz(page, request, `cm-${testInfo.project.name}`);

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

  // Keep the first question the pipeline found ready and drop the rest, as a teacher would after
  // reviewing. (Some the fake client stages need an answer or a fix; those cannot be imported.)
  const [kept] = await selectAsAdmin<{ id: string }>(
    request,
    "ai_import_entries",
    `select=id&batch_id=eq.${batchId}&status=eq.ready&item=not.is.null&order=position&limit=1`,
  );
  expect(kept).toBeTruthy();
  await updateAsAdmin(request, "ai_import_entries", `batch_id=eq.${batchId}&id=neq.${kept!.id}`, {
    status: "dropped",
  });
  const [file] = await selectAsAdmin<{ storage_path: string }>(
    request,
    "ai_import_files",
    `select=storage_path&batch_id=eq.${batchId}`,
  );
  expect(file).toBeTruthy();
  // Control: the object is there before the import, so the check after it means something.
  expect(await objectExists(request, file!.storage_path)).toBe(true);
  await page.reload();

  const importButton = page.getByTestId("import-button");
  await expect(importButton).toHaveText("Import 1 question");
  await expect(importButton).toBeEnabled();
  await expectNoAxeViolations(page);
  await importButton.click();
  await expect(page.getByText(`1 question was added to ${quizName} as a draft.`)).toBeVisible({
    timeout: 30_000,
  });

  // The batch page says imported, now and after a reload.
  await page.reload();
  await expect(page.getByTestId("imported-summary")).toContainText(
    `1 question was added to ${quizName} as a draft.`,
  );
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-imported.png`, fullPage: true });

  // The quiz holds the drafts; the staging rows and the uploaded object are gone.
  const items = await selectAsAdmin<{ status: string }>(
    request,
    "items",
    `select=status&bank_id=eq.${bankId}`,
  );
  expect(items.map((item) => item.status)).toEqual(["draft"]);
  const [batch] = await selectAsAdmin<{ status: string }>(
    request,
    "ai_import_batches",
    `select=status&id=eq.${batchId}`,
  );
  expect(batch?.status).toBe("imported");
  expect(
    await selectAsAdmin(request, "ai_import_entries", `select=id&batch_id=eq.${batchId}`),
  ).toEqual([]);
  expect(
    await selectAsAdmin(request, "ai_import_files", `select=id&batch_id=eq.${batchId}`),
  ).toEqual([]);
  expect(await objectExists(request, file!.storage_path)).toBe(false);

  await page.getByRole("link", { name: `Open ${quizName}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();
});

test("a teacher discards a batch in review after confirming", async ({
  page,
  request,
}, testInfo) => {
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const { orgId, bankId, quizName } = await teacherWithQuiz(
    page,
    request,
    `cmd-${testInfo.project.name}`,
  );
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
    source_excerpt: "A fictional question to discard.",
  });

  await page.goto(`/author/banks/${bankId}/ai-import/${batch.id}`);
  await page.getByRole("button", { name: "Discard this import" }).click();
  const dialog = page.getByRole("dialog", { name: "Discard this import?" });
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-discard.png` });

  // Keeping it changes nothing.
  await dialog.getByRole("button", { name: "Keep reviewing" }).click();
  await expect(dialog).toBeHidden();
  expect(
    await selectAsAdmin(request, "ai_import_batches", `select=id&id=eq.${batch.id}`),
  ).toHaveLength(1);

  await page.getByRole("button", { name: "Discard this import" }).click();
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();
  expect(await selectAsAdmin(request, "ai_import_batches", `select=id&id=eq.${batch.id}`)).toEqual(
    [],
  );
  expect(
    await selectAsAdmin(request, "ai_import_entries", `select=id&batch_id=eq.${batch.id}`),
  ).toEqual([]);
});
