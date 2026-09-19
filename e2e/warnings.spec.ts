import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

const NO_RATIONALE = "Warnings demo A: which action should the nurse take first?";
const NO_QUESTION = "Warnings demo B: the client is short of breath.";
const CLEAN = "Warnings demo C: which finding matters most?";

/** Three complete items: one with no rationale, one whose stem asks nothing, one with neither. */
function threeItems(): string {
  const base = FIXTURES.multiple_choice.canonical;
  const items = [
    { ...base, id: "warn-a", stem: { kind: "markdown", value: NO_RATIONALE }, rationale: {} },
    { ...base, id: "warn-b", stem: { kind: "markdown", value: NO_QUESTION } },
    { ...base, id: "warn-c", stem: { kind: "markdown", value: CLEAN } },
  ];
  return JSON.stringify({ format: "learn.v1", items });
}

const itemLinks = (page: Page) =>
  page.getByRole("list", { name: "Items" }).getByRole("link", { name: /^Warnings demo/ });
const filterBar = (page: Page) => page.getByRole("region", { name: "Filter by tag" });

test("an author filters the bank to Has warnings, adds a rationale, and the warning clears", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `Warnings ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  const bankUrl = page.url();

  await page.getByRole("textbox", { name: "Or paste JSON", exact: true }).fill(threeItems());
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(itemLinks(page)).toHaveCount(3);
  await expect(itemLinks(page).filter({ hasText: NO_RATIONALE })).toContainText("1 warning");
  await expect(itemLinks(page).filter({ hasText: CLEAN })).not.toContainText("warning");
  // Warnings are counted on the server: the page carries counts, never keys or rationale.
  const html = await page.content();
  expect(html).not.toContain(FIXTURES.multiple_choice.canonical.answerKey.correctOptionId);
  expect(html).not.toContain("answerKey");

  // Has warnings lists only the two items with warnings, and the URL keeps it.
  await filterBar(page).getByRole("link", { name: "Has warnings, 2 items", exact: true }).click();
  await expect(page).toHaveURL(/\?warnings=1$/);
  await expect(itemLinks(page)).toHaveCount(2);
  await expect(itemLinks(page).filter({ hasText: CLEAN })).toHaveCount(0);
  await page.reload();
  await expect(itemLinks(page)).toHaveCount(2);
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/bank-warnings.png`,
    fullPage: true,
  });

  // The item without a rationale cannot be published until one is written.
  await itemLinks(page).filter({ hasText: NO_RATIONALE }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit item" })).toBeVisible();
  const problems = page.getByRole("region", { name: "Problems to fix" });
  const fix = problems.getByRole("button", { name: /^Write the rationale/ });
  await expect(fix).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/editor-warnings.png`,
    fullPage: true,
  });

  // The message points at the field; writing a rationale clears it.
  await fix.click();
  const rationale = page.getByRole("textbox", { name: "Rationale", exact: true });
  await expect(rationale).toBeFocused();
  await rationale.fill("Airway comes first: without it, nothing else the nurse does matters.");
  await expect(problems).toHaveCount(0);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

  // Back in the filtered bank, only the item whose stem asks nothing is left.
  await page.goto(`${bankUrl}?warnings=1`);
  await expect(itemLinks(page)).toHaveCount(1);
  await expect(itemLinks(page).filter({ hasText: NO_QUESTION })).toContainText("1 warning");

  // Its warning is advice: it is listed beside the problems and does not block publishing.
  await itemLinks(page).filter({ hasText: NO_QUESTION }).click();
  await expect(page.getByRole("region", { name: "Quality warnings" })).toContainText(
    "The stem does not ask anything.",
  );
  await expect(page.getByRole("button", { name: "Publish", exact: true })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expectNoAxeViolations(page);
});
