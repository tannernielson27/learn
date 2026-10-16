import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { fromMatrixMultipleChoiceDraft } from "../src/lib/ngn/draft";
import { wireText } from "./bytes";
import {
  insertAsAdmin,
  selectAsAdmin,
  signInAsInstructorInEmptyOrg,
  updateAsAdmin,
} from "./signIn";

// #347: fix a staged AI import question with its type's own editor. Needs the local Supabase
// stack. No Claude call is made: the batch and its entry are written as staging leaves them.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

/** A teacher in a workspace of their own, with AI import on, and a new quiz. */
async function teacherWithQuiz(page: Page, request: APIRequestContext, label: string) {
  const orgId = await signInAsInstructorInEmptyOrg(page, request, label);
  await updateAsAdmin(request, "orgs", `id=eq.${orgId}`, { ai_import_enabled: true });
  const quizName = `Fix ${label} ${Date.now()}`;
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(quizName);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();
  const bankId = new URL(page.url()).pathname.split("/").at(-1)!;
  return { orgId, bankId };
}

// Fictional, in the Malnutrition sample's shape: a matrix whose source marks no answer, which
// staging keeps with an empty key as "Needs an answer" (#343).
const unmarked = fromMatrixMultipleChoiceDraft({
  type: "matrix_multiple_choice",
  stem: "For each finding, choose whether it is expected or unexpected in malnutrition.",
  columns: ["Expected", "Unexpected"],
  rows: [
    { text: "Serum albumin 2.4 g/dL", cells: ["", ""] },
    { text: "Brisk capillary refill", cells: ["", ""] },
    { text: "Muscle wasting at the temples", cells: ["", ""] },
  ],
}).item;

/** A batch in review holding one unmarked matrix. */
async function stagedMatrix(request: APIRequestContext, orgId: string, bankId: string) {
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
    type: "matrix_multiple_choice",
    status: "needs_answer",
    reasons: [
      "needs_answer: The source marks no answer. Add the key before this question can be imported.",
    ],
    source_excerpt: "Malnutrition. For each finding, choose whether it is expected or unexpected.",
    item: unmarked,
  });
  return { batchId: batch.id, entryId: entry.id };
}

test("a teacher marks the key on an unmarked matrix and it becomes Ready", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const { orgId, bankId } = await teacherWithQuiz(page, request, `fx-${testInfo.project.name}`);
  const { batchId, entryId } = await stagedMatrix(request, orgId, bankId);

  await page.goto(`/author/banks/${bankId}/ai-import/${batchId}`);
  await expect(page.getByTestId("entry-status")).toHaveText("Needs an answer");
  await expect(page.getByTestId("import-button")).toBeDisabled();
  await page.getByRole("link", { name: "Edit Question 1" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Edit Question 1" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Question stem" })).toHaveValue(
    /expected or unexpected in malnutrition/,
  );
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-fix-editor.png`, fullPage: true });

  const mark = (row: number, column: string) =>
    page
      .getByRole("radiogroup", { name: `Correct column for row ${row}` })
      .getByRole("radio", { name: column })
      .check();
  await mark(1, "Expected");
  await mark(2, "Unexpected");
  await mark(3, "Expected");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toHaveText(
    "Saved. This question is ready to import.",
  );
  await expect(page.getByTestId("entry-status")).toHaveText("Ready");

  const [saved] = await selectAsAdmin<{ status: string; reasons: string[]; item: unknown }>(
    request,
    "ai_import_entries",
    `select=status,reasons,item&id=eq.${entryId}`,
  );
  expect(saved?.status).toBe("ready");
  expect(saved?.reasons.some((reason) => reason.startsWith("needs_answer"))).toBe(false);
  expect(saved?.item).toMatchObject({
    answerKey: {
      rows: [
        { rowId: "row_1", correctColumnId: "col_1" },
        { rowId: "row_2", correctColumnId: "col_2" },
        { rowId: "row_3", correctColumnId: "col_1" },
      ],
    },
  });

  await page.getByRole("link", { name: "Back to the review" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Review AI import" })).toBeVisible();
  await expect(page.getByTestId("entry-status")).toHaveText("Ready");
  await expect(page.getByText(/needs? an answer\. Add/)).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-fix-ready.png`, fullPage: true });
});

test("another workspace's teacher cannot open a staged question's editor", async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.slow();
  const label = `fxb-${testInfo.project.name}`;
  const { orgId, bankId } = await teacherWithQuiz(page, request, label);
  const { batchId, entryId } = await stagedMatrix(request, orgId, bankId);
  const editPath = `/author/banks/${bankId}/ai-import/${batchId}/${entryId}`;
  const marker = "Muscle wasting at the temples";

  // Control: the batch's own teacher is handed the question, so the grep below can match.
  const own = await page.context().request.get(editPath);
  expect(own.status()).toBe(200);
  expect(wireText(await own.text())).toContain(marker);

  const outsider = await browser.newContext();
  const outsiderPage = await outsider.newPage();
  const otherOrg = await signInAsInstructorInEmptyOrg(outsiderPage, request, `${label}-other`);
  await updateAsAdmin(request, "orgs", `id=eq.${otherOrg}`, { ai_import_enabled: true });
  const outsiderGet = await outsider.request.get(editPath);
  expect(outsiderGet.status()).toBe(404);
  expect(wireText(await outsiderGet.text())).not.toContain(marker);
  await outsider.close();
});
