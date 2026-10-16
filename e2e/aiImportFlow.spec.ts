import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { publishOpenItem, writeRationale } from "./authoringHelpers";
import { selectAsAdmin, signInAsInstructorInEmptyOrg, updateAsAdmin } from "./signIn";

// #349: the whole AI import walk through the interface, as a teacher does it: upload, review,
// add a missing answer, drop the rest, import, and publish what came in. Nothing is written to
// the database behind the page's back. Needs the local Supabase stack (with Storage) and a build
// with AI_IMPORT_FAKE=1 (src/lib/aiImport/fakeClaude.ts): no live API call is made.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const CORPUS = path.resolve("test", "ai-import", "corpus");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

/** The opening words of corpus question 3, which marks no option: "Needs an answer". */
const HYPOGLYCEMIA = "The capillary blood glucose is 52 mg/dL";

const BLOCKING = /^(Needs an answer|Needs a fix)$/;

test("a teacher imports a document with AI, fixes a question, and publishes it", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  const orgId = await signInAsInstructorInEmptyOrg(page, request, `flow-${testInfo.project.name}`);
  // As the owner does for an invited workspace: the one step a teacher cannot take.
  await updateAsAdmin(request, "orgs", `id=eq.${orgId}`, { ai_import_enabled: true });

  const quizName = `Flow ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(quizName);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();
  const bankId = new URL(page.url()).pathname.split("/").at(-1)!;

  // Upload.
  await page.getByRole("link", { name: "Import with AI", exact: true }).click();
  await expect(page.getByRole("link", { name: "How AI import works" })).toHaveAttribute(
    "href",
    "/help/instructor#ai-import",
  );
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

  // Review.
  await page.getByRole("link", { name: "Review the questions" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Review AI import" })).toBeVisible();
  const importButton = page.getByTestId("import-button");
  await expect(importButton).toBeDisabled();
  const cards = page.getByRole("article");
  const unanswered = cards.filter({ hasText: HYPOGLYCEMIA });
  await expect(unanswered.getByTestId("entry-status")).toHaveText("Needs an answer");
  const heading = await unanswered.getByRole("heading", { level: 3 }).innerText();

  // Fix: mark the answer the document gives in its "Answer: A" line, which the fake client
  // does not read, then Save.
  await unanswered.getByRole("link", { name: `Edit ${heading}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Edit ${heading}` })).toBeVisible();
  await page.getByRole("radio", { name: "Option A is correct" }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toHaveText(
    "Saved. This question is ready to import.",
  );
  await page.getByRole("link", { name: "Back to the review" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Review AI import" })).toBeVisible();
  await expect(unanswered.getByTestId("entry-status")).toHaveText("Ready");

  // Drop every question still blocking the import, one card at a time, as a teacher would.
  const blocking = cards.filter({
    has: page.getByTestId("entry-status").filter({ hasText: BLOCKING }),
  });
  for (let left = await blocking.count(); left > 0; left = await blocking.count()) {
    const card = blocking.first();
    const name = await card.getByRole("heading", { level: 3 }).innerText();
    await card.getByRole("button", { name: "Drop", exact: true }).click();
    await expect(
      cards
        .filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) })
        .getByTestId("entry-status"),
    ).toHaveText("Dropped");
    await expect(blocking).toHaveCount(left - 1);
  }
  await expect(importButton).toBeEnabled();
  const label = (await importButton.innerText()).trim();
  const count = Number(/^Import (\d+) questions?$/.exec(label)?.[1]);
  expect(count).toBeGreaterThanOrEqual(2);
  await expectNoAxeViolations(page);

  // Import.
  await importButton.click();
  await expect(
    page.getByText(`${count} questions were added to ${quizName} as drafts.`),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: `Open ${quizName}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName })).toBeVisible();

  // Publish the question that was fixed: the AI wrote no rationale, so the teacher does.
  const fixed = page.getByRole("link", { name: /^A client with type 1 diabetes/ });
  await expect(fixed).not.toContainText("Published");
  await fixed.click();
  await expect(page.getByRole("radio", { name: "Option A is correct" })).toBeChecked();
  await writeRationale(
    page,
    "Fast-acting sugar by mouth first, for an awake client who can swallow.",
  );
  await publishOpenItem(page);
  await page.getByRole("link", { name: "Back to quiz" }).click();
  await expect(page.getByRole("link", { name: /^A client with type 1 diabetes/ })).toContainText(
    "Published",
  );
  await page.screenshot({ path: `${shots}/ai-import-flow-published.png`, fullPage: true });

  // The quiz holds what was imported, one of it published; nothing staged is left.
  const items = await selectAsAdmin<{ status: string }>(
    request,
    "items",
    `select=status&bank_id=eq.${bankId}`,
  );
  expect(items).toHaveLength(count);
  expect(items.filter((item) => item.status === "published")).toHaveLength(1);
  expect(
    await selectAsAdmin(
      request,
      "ai_import_batches",
      `select=id&bank_id=eq.${bankId}&status=neq.imported`,
    ),
  ).toEqual([]);
  expect(await selectAsAdmin(request, "ai_import_entries", `select=id&org_id=eq.${orgId}`)).toEqual(
    [],
  );
});
