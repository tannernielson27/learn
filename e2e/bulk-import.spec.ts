import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ITEM_PAGE_SIZE } from "../src/lib/authoring/bankSearch";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

const ITEMS_PER_FILE = 40;
const BROKEN_ENTRY = 7;

/** One learn.v1 file of 40 items, built here so no large JSON is committed. */
function exportFile(file: number, { broken = false } = {}) {
  const items = Array.from({ length: ITEMS_PER_FILE }, (_, index) => ({
    ...FIXTURES.multiple_choice.canonical,
    id: `bulk-${file}-${index + 1}`,
    stem: {
      kind: "markdown",
      value: broken && index + 1 === BROKEN_ENTRY ? "" : `Cardiac bulk ${file}.${index + 1}`,
    },
  }));
  return {
    name: `cardiac-${file}.learn.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "learn.v1", items })),
  };
}

const itemLinks = (page: Page) =>
  page.getByRole("list", { name: "Items" }).getByRole("link", { name: /^Cardiac bulk/ });

test("an author imports three files of 120 items into Cardiac; the broken file is reported and the others land", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, a folder and three imports of 40 items: longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `Bulk ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("textbox", { name: "Folder name", exact: true }).fill("Cardiac");
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  const folders = page.getByRole("navigation", { name: "Folders" });
  await expect(folders.getByRole("link", { name: "Cardiac", exact: true })).toBeVisible();

  await page
    .getByLabel("JSON files")
    .setInputFiles([exportFile(1), exportFile(2, { broken: true }), exportFile(3)]);
  await page.getByRole("combobox", { name: "Import into" }).selectOption({ label: "Cardiac" });
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Imported 2 of 3 files into Cardiac." }),
  ).toContainText("1 was refused.");
  const imported = page.getByRole("list", { name: "Imported files" }).getByRole("listitem");
  await expect(imported).toHaveText([
    "cardiac-1.learn.json: Imported 40 items as drafts.",
    "cardiac-3.learn.json: Imported 40 items as drafts.",
  ]);
  // Filtered: Next's route announcer is also an alert.
  const refused = page.getByRole("alert").filter({ hasText: "cardiac-2.learn.json" });
  await expect(refused).toContainText("cardiac-2.learn.json: Nothing was imported.");
  await expect(refused).toContainText(`Item ${BROKEN_ENTRY}: "stem.value" is not valid.`);
  // The report names the file, entry and field, never the file's own text.
  await expect(refused).not.toContainText("Cardiac bulk");
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/bulk-import-report.png`,
    fullPage: true,
  });

  // The two good files landed whole in Cardiac, as drafts; nothing from the broken one did.
  // 80 items span two pages, because the bank list pages at ITEM_PAGE_SIZE (#105).
  await folders.getByRole("link", { name: "Cardiac", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cardiac" })).toBeVisible();
  const pages = page.getByRole("navigation", { name: "Pages" });
  await expect(pages).toContainText("Page 1 of 2");
  await expect(itemLinks(page)).toHaveCount(ITEM_PAGE_SIZE);
  await expect(itemLinks(page).filter({ hasText: "Cardiac bulk 2." })).toHaveCount(0);
  await expect(itemLinks(page).filter({ hasNotText: "Draft" })).toHaveCount(0);
  await pages.getByRole("link", { name: "Next page" }).click();
  await expect(pages).toContainText("Page 2 of 2");
  await expect(itemLinks(page)).toHaveCount(2 * ITEMS_PER_FILE - ITEM_PAGE_SIZE);
  await expect(itemLinks(page).filter({ hasText: "Cardiac bulk 2." })).toHaveCount(0);
  await expect(itemLinks(page).filter({ hasNotText: "Draft" })).toHaveCount(0);
  await folders.getByRole("link", { name: "Unfiled", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No unfiled items", exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
});
