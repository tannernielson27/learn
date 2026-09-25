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

const stems = Array.from({ length: 10 }, (_, index) => `Folder demo item ${index + 1}`);

function tenItems(): string {
  const items = stems.map((value, index) => ({
    ...FIXTURES.multiple_choice.canonical,
    id: `folder-demo-${index + 1}`,
    stem: { kind: "markdown", value },
  }));
  return JSON.stringify({ format: "learn.v1", items });
}

async function createFolder(page: Page, name: string) {
  await page.getByRole("textbox", { name: "Folder name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Folders" }).getByRole("link", { name, exact: true }),
  ).toBeVisible();
}

async function moveItems(page: Page, names: string[], folder: string) {
  for (const name of names) {
    await page.getByRole("checkbox", { name: `Select ${name}`, exact: true }).check();
  }
  await page.getByRole("combobox", { name: "Move selected to" }).selectOption({ label: folder });
  await page.getByRole("button", { name: "Move selected", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `Moved ${names.length} items to ${folder}.` }),
  ).toBeVisible();
}

const itemLinks = (page: Page) =>
  page.getByRole("list", { name: "Items" }).getByRole("link", { name: /^Folder demo item/ });

test("an author sorts ten items into Cardiac and Respiratory and opens a folder", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, an import, two folders, two moves and a nested folder: longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `Folders ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("textbox", { name: "Or paste JSON", exact: true }).fill(tenItems());
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(itemLinks(page)).toHaveCount(10);

  await createFolder(page, "Cardiac");
  await createFolder(page, "Respiratory");
  await moveItems(page, stems.slice(0, 5), "Cardiac");
  await moveItems(page, stems.slice(5), "Respiratory");

  // Nothing is left unfiled, and moving left every item a draft.
  const folders = page.getByRole("navigation", { name: "Folders" });
  await folders.getByRole("link", { name: "Unfiled", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No unfiled items", exact: true })).toBeVisible();

  // Open Cardiac from the keyboard.
  const cardiac = folders.getByRole("link", { name: "Cardiac", exact: true });
  await cardiac.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?folder=[0-9a-f-]{36}$/);
  await expect(cardiac).toHaveAttribute("aria-current", "page");
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.getByRole("link", { name: bankName, exact: true })).toBeVisible();
  await expect(breadcrumb.getByText("Cardiac", { exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(itemLinks(page)).toHaveCount(5);
  // Only items 1 to 5 are listed here, so "item 1" cannot match "item 10".
  for (const stem of stems.slice(0, 5)) {
    await expect(itemLinks(page).filter({ hasText: stem })).toContainText("Draft");
  }
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/bank-folder.png`,
    fullPage: true,
  });

  // A folder with content says what is inside instead of being deleted.
  await page.getByRole("button", { name: "Delete folder", exact: true }).click();
  // Filtered: Next's route announcer is also an alert.
  await expect(
    page.getByRole("alert").filter({ hasText: '"Cardiac" holds 5 items.' }),
  ).toContainText('"Cardiac" holds 5 items. Move or delete them first.');

  // A folder inside Cardiac: breadcrumbs follow, and an empty folder can be renamed and deleted.
  await createFolder(page, "Heart failure");
  await folders.getByRole("link", { name: "Heart failure", exact: true }).click();
  await expect(breadcrumb.getByRole("link", { name: "Cardiac", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "New name", exact: true }).fill("Heart failure care");
  await page.getByRole("button", { name: "Rename folder", exact: true }).click();
  await expect(
    folders.getByRole("link", { name: "Heart failure care", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete folder", exact: true }).click();
  await expect(page).toHaveURL(/\?folder=[0-9a-f-]{36}$/);
  await expect(folders.getByRole("link", { name: "Heart failure care", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { level: 1, name: "Cardiac" })).toBeVisible();
  await expectNoAxeViolations(page);
});
