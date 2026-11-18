import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { fromMatrixMultipleChoiceDraft } from "../src/lib/ngn/draft";
import { sampleCaseStudy } from "../src/lib/ngn/fixtures";
import { expectTurnedAway, signedInStudent } from "./aiImportVisitors";
import { wireText } from "./bytes";
import {
  insertAsAdmin,
  selectAsAdmin,
  signInAsInstructorInEmptyOrg,
  updateAsAdmin,
} from "./signIn";

// #347: fix a staged AI import question with its type's own editor. Needs the local Supabase
// stack. No Claude call is made: the batch and its entry are written as staging leaves them.
// #593: several in a row with "next", the rest dropped at once, and a case study's two paths.
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
      .getByRole("radio", { name: column, exact: true })
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

test("a staged question's source and key reach nobody but its own workspace's teachers", async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.slow();
  const label = `fxb-${testInfo.project.name}`;
  const { orgId, bankId } = await teacherWithQuiz(page, request, label);
  const stamp = Date.now();
  // Two things to look for, each in one place only. The first is in the stored part of the
  // document and nowhere in the question; the second is the key itself, as it is written: the
  // id of the right option, which no page shows a student before a reveal.
  const sourceOnly = `only-in-the-source-${stamp}`;
  const key = `"correctOptionId":"opt_key_${stamp}"`;
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
    status: "ready",
    reasons: [],
    source_excerpt: `Which food should the nurse suggest first?\nA. Tea\n**B. Yogurt**\nAnswer: B (${sourceOnly})`,
    item: {
      id: "e2e_keyed",
      type: "multiple_choice",
      stem: { kind: "markdown", value: "Which food should the nurse suggest first?" },
      content: {
        options: [
          { id: "opt_a", label: "Tea" },
          { id: `opt_key_${stamp}`, label: "Yogurt" },
          { id: "opt_c", label: "Toast" },
          { id: "opt_d", label: "Broth" },
        ],
      },
      answerKey: { correctOptionId: `opt_key_${stamp}` },
      scoring: { model: "zero_one", maxPoints: 1 },
      rationale: {},
    },
  });
  const reviewPath = `/author/banks/${bankId}/ai-import/${batch.id}`;
  const paths = [reviewPath, `${reviewPath}/${entry.id}`];
  const secrets = [sourceOnly, key];

  // Control: the batch's own teacher is sent both, on both pages, so each grep below can match.
  for (const path of paths) {
    const own = await page.context().request.get(path);
    expect(own.status(), path).toBe(200);
    const bytes = wireText(await own.text());
    for (const secret of secrets) expect(bytes, `${path} holds ${secret}`).toContain(secret);
  }

  // A teacher of another workspace, with AI import on: not found.
  const outsider = await browser.newContext();
  const outsiderPage = await outsider.newPage();
  const otherOrg = await signInAsInstructorInEmptyOrg(outsiderPage, request, `${label}-other`);
  await updateAsAdmin(request, "orgs", `id=eq.${otherOrg}`, { ai_import_enabled: true });
  for (const path of paths) expect((await outsider.request.get(path)).status(), path).toBe(404);
  await expectTurnedAway(outsider, paths, secrets, "another workspace's teacher");
  await outsider.close();

  // A student of the same workspace: sent away from every author page.
  const student = await signedInStudent(browser, request, `${label}-student`, orgId);
  await expectTurnedAway(student.context, paths, secrets, "a student");
  await student.context.close();

  // Nobody signed in: sent to sign in.
  const stranger = await browser.newContext();
  await expectTurnedAway(stranger, paths, secrets, "a signed-out visitor");
  await stranger.close();
});

/** A batch in review holding `count` unmarked matrices, in order, each needing an answer. */
async function stagedMatrices(
  request: APIRequestContext,
  orgId: string,
  bankId: string,
  count: number,
) {
  const batch = await insertAsAdmin<{ id: string }>(request, "ai_import_batches", {
    org_id: orgId,
    bank_id: bankId,
    status: "review",
  });
  for (let position = 0; position < count; position += 1) {
    await insertAsAdmin(request, "ai_import_entries", {
      batch_id: batch.id,
      org_id: orgId,
      position,
      kind: "item",
      type: "matrix_multiple_choice",
      status: "needs_answer",
      reasons: [
        "needs_answer: The source marks no answer. Add the key before this question can be imported.",
      ],
      // The whole part of the document, with the marks a Word file arrives with (#593).
      source_excerpt: `${position + 1}. For each finding, choose whether it is expected or unexpected.\n\n| Finding | Expected | Unexpected |\n| --- | --- | --- |\n| **Serum albumin 2.4 g/dL** | | |\n| Brisk capillary refill | | |`,
      item: { ...unmarked, id: `e2e_matrix_${position + 1}` },
    });
  }
  return batch.id;
}

// #593: the issue's acceptance run. Six questions need attention; two are fixed with "next", the
// rest are dropped in one action, and what is left is imported after a confirmation.
test("six need attention: two fixed with next, the rest dropped at once, then imported", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const { orgId, bankId } = await teacherWithQuiz(page, request, `fxn-${testInfo.project.name}`);
  const batchId = await stagedMatrices(request, orgId, bankId, 6);
  const quizName = await page.getByRole("heading", { level: 1 }).innerText();
  const reviewPath = `/author/banks/${bankId}/ai-import/${batchId}`;

  // The filter is in the address, so the review opens on it.
  await page.goto(`${reviewPath}?show=needs_answer`);
  await expect(page.getByRole("button", { name: "Needs an answer (6)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("article")).toHaveCount(6);

  // The source beside the question is its whole part of the document, marks drawn as formatting.
  const first = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Question 1", exact: true }) });
  await first.getByRole("button", { name: "Show source" }).click();
  const source = first.getByRole("region", { name: "Question 1, source" });
  await expect(source.locator("strong")).toHaveText("Serum albumin 2.4 g/dL");
  await expect(source).toContainText("Brisk capillary refill");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-review-attention.png`, fullPage: true });

  const mark = (row: number, column: string) =>
    page
      .getByRole("radiogroup", { name: `Correct column for row ${row}` })
      .getByRole("radio", { name: column, exact: true })
      .check();
  const markAll = async () => {
    await mark(1, "Expected");
    await mark(2, "Unexpected");
    await mark(3, "Expected");
  };

  // Fix two, each with one press that saves and opens the next one that needs attention.
  await first.getByRole("link", { name: "Edit Question 1" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit Question 1" })).toBeVisible();
  await markAll();
  await page.getByRole("button", { name: "Save and go to the next one" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit Question 2" })).toBeVisible();
  await markAll();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-fix-next.png`, fullPage: true });
  await page.getByRole("button", { name: "Save and go to the next one" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit Question 3" })).toBeVisible();

  // A changed form is not thrown away by a breadcrumb: it asks first.
  await mark(1, "Expected");
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Review AI import" })
    .click();
  const ask = page.getByRole("alertdialog", { name: "This question has unsaved changes" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Stay on this question" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit Question 3" })).toBeVisible();
  await page.getByRole("link", { name: "Back to the review" }).click();
  await ask.getByRole("button", { name: "Discard changes" }).click();

  // Back where the teacher was: the same filter, at the card they left.
  await expect(page.getByRole("heading", { level: 1, name: "Review AI import" })).toBeVisible();
  await expect(page).toHaveURL(/\?show=needs_answer#entry-/);
  await expect(page.getByRole("button", { name: "Needs an answer (4)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("article")).toHaveCount(4);

  // Drop the rest in one action, after one confirmation, from the keyboard.
  await page.getByTestId("drop-all-button").focus();
  await expect(page.getByTestId("drop-all-button")).toHaveText("Drop the 4 that need attention");
  await page.keyboard.press("Enter");
  const dropDialog = page.getByRole("dialog", { name: "Drop the 4 that need attention?" });
  await expect(dropDialog).toBeVisible();
  await expectNoAxeViolations(page);
  await dropDialog.getByRole("button", { name: "Drop 4" }).focus();
  await page.keyboard.press("Enter");
  // The cards have left the filter; what they would have said is kept, with the focus.
  await expect(page.getByTestId("review-notice")).toHaveText("Dropped 4.");
  await expect(page.getByTestId("review-notice")).toBeFocused();
  await expect(page.getByRole("article")).toHaveCount(0);
  const statuses = await selectAsAdmin<{ status: string }>(
    request,
    "ai_import_entries",
    `select=status&batch_id=eq.${batchId}&order=position`,
  );
  expect(statuses.map((row) => row.status)).toEqual([
    "ready",
    "ready",
    "dropped",
    "dropped",
    "dropped",
    "dropped",
  ]);

  // Import asks first, and says the counts and the quiz.
  await page.getByRole("button", { name: "All (6)" }).click();
  await expect(page).toHaveURL(new RegExp(`${batchId}$`));
  const importButton = page.getByTestId("import-button");
  await expect(importButton).toHaveText("Import 2 questions");
  await importButton.focus();
  await page.keyboard.press("Enter");
  const importDialog = page.getByRole("dialog", { name: `Import into ${quizName}?` });
  await expect(importDialog).toContainText(
    `2 questions will be added to ${quizName} as drafts. Left out: 4 dropped.`,
  );
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-confirm.png` });
  await page.getByTestId("import-confirm").click();
  await expect(page.getByText(`2 questions were added to ${quizName} as drafts.`)).toBeVisible({
    timeout: 30_000,
  });

  // The imported questions are findable: the quiz, filtered to its drafts.
  await page.getByRole("link", { name: "Show its draft questions" }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();
  await expect(page).toHaveURL(/status=draft/);
  const items = await selectAsAdmin<{ status: string }>(
    request,
    "items",
    `select=status&bank_id=eq.${bankId}`,
  );
  expect(items.map((item) => item.status)).toEqual(["draft", "draft"]);
});

// The fictional sample case study with step 4's key taken out, as staging leaves a step the
// document does not mark (#343): the entry needs an answer and blocks the import.
const unkeyedCase = {
  ...sampleCaseStudy,
  items: sampleCaseStudy.items.map((item, index) => {
    if (index !== 3) return item;
    return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "answerKey"));
  }),
};

async function stagedCaseStudy(request: APIRequestContext, orgId: string, bankId: string) {
  const batch = await insertAsAdmin<{ id: string }>(request, "ai_import_batches", {
    org_id: orgId,
    bank_id: bankId,
    status: "review",
  });
  const entry = await insertAsAdmin<{ id: string }>(request, "ai_import_entries", {
    batch_id: batch.id,
    org_id: orgId,
    position: 0,
    kind: "case_study",
    type: null,
    status: "needs_answer",
    reasons: [
      "needs_answer: Step 4: The source marks no answer. Add the key before this question can be imported.",
    ],
    source_excerpt: "A 74-year-old woman, post-operative day 1 following a hip replacement.",
    group_key: "Pulmonary embolism",
    item: unkeyedCase,
  });
  return { batchId: batch.id, entryId: entry.id };
}

// #593, the demo step: a case study with one unanswered step is keyed, becomes Ready and imports.
test("a teacher keys a case study's unanswered step, and the case study imports", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const { orgId, bankId } = await teacherWithQuiz(page, request, `fxc-${testInfo.project.name}`);
  const quizName = await page.getByRole("heading", { level: 1 }).innerText();
  const { batchId, entryId } = await stagedCaseStudy(request, orgId, bankId);

  await page.goto(`/author/banks/${bankId}/ai-import/${batchId}`);
  const card = page.getByRole("article");
  await expect(card.getByTestId("entry-status")).toHaveText("Needs an answer");
  await expect(page.getByTestId("import-button")).toBeDisabled();
  // Every step is listed, and the one with no key says so.
  await expect(card.locator("summary")).toHaveCount(6);
  await expect(card.locator("summary").nth(3)).toContainText("No key yet");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-case-study.png`, fullPage: true });

  await card.getByRole("link", { name: /^Add the key to step 4/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Edit step 4 of 6 in Pulmonary embolism" }),
  ).toBeVisible();
  for (const letter of ["A", "B", "C", "F"]) {
    await page.getByRole("checkbox", { name: `Option ${letter} is correct` }).check();
  }
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toHaveText(
    "Saved. The case study is ready to import.",
  );
  const [saved] = await selectAsAdmin<{ status: string; kind: string; item: unknown }>(
    request,
    "ai_import_entries",
    `select=status,kind,item&id=eq.${entryId}`,
  );
  expect(saved).toMatchObject({ status: "ready", kind: "case_study" });
  expect((saved?.item as { items: unknown[] }).items[3]).toMatchObject({
    cjmmStep: 4,
    answerKey: { correctOptionIds: ["o_o2", "o_ct", "o_antico", "o_hob"] },
  });

  await page.getByRole("link", { name: "Back to the review" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Review AI import" })).toBeVisible();
  await expect(card.getByTestId("entry-status")).toHaveText("Ready");
  await page.getByTestId("import-button").click();
  await page.getByTestId("import-confirm").click();
  await expect(page.getByText(`1 case study was added to ${quizName} as a draft.`)).toBeVisible({
    timeout: 30_000,
  });
  const cases = await selectAsAdmin<{ title: string }>(
    request,
    "case_studies",
    `select=title&bank_id=eq.${bankId}`,
  );
  expect(cases).toHaveLength(1);
});

test("a teacher splits a case study into six separate questions", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const { orgId, bankId } = await teacherWithQuiz(page, request, `fxs-${testInfo.project.name}`);
  const { batchId, entryId } = await stagedCaseStudy(request, orgId, bankId);

  await page.goto(`/author/banks/${bankId}/ai-import/${batchId}`);
  await page.getByRole("button", { name: "Split into separate questions" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Split this case study?" });
  await expect(dialog).toContainText("The patient record is not attached to them.");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/ai-import-split.png` });
  await dialog.getByRole("button", { name: "Split", exact: true }).click();

  await expect(page.getByTestId("review-notice")).toHaveText(
    "Case study: Pulmonary embolism is now 6 separate questions.",
  );
  await expect(page.getByRole("article")).toHaveCount(6);
  await expect(
    page.getByText(
      'Split from the case study "Pulmonary embolism". The patient record was not attached.',
    ),
  ).toHaveCount(6);
  // Five steps had their keys; the one that did not goes through the single-question path.
  await expect(page.getByTestId("entry-status").filter({ hasText: "Ready" })).toHaveCount(5);
  await expect(page.getByTestId("entry-status").filter({ hasText: "Needs an answer" })).toHaveCount(
    1,
  );
  await expect(page.getByRole("link", { name: "Edit Question 4" })).toBeVisible();
  await expectNoAxeViolations(page);

  const rows = await selectAsAdmin<{ id: string; kind: string; position: number; step: number }>(
    request,
    "ai_import_entries",
    `select=id,kind,position,step&batch_id=eq.${batchId}&order=position`,
  );
  expect(rows.map((row) => [row.kind, row.position, row.step])).toEqual(
    [1, 2, 3, 4, 5, 6].map((step) => ["item", step - 1, step]),
  );
  // The case study's own row became step 1; the other five are new.
  expect(rows[0]?.id).toBe(entryId);
});
