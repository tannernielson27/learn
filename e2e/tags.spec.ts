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

const PA = "Physiological Adaptation";
const stems = Array.from({ length: 10 }, (_, index) => `Tag demo item ${index + 1}`);
// Items 1 to 8 arrive tagged; item 9 is tagged in its editor; item 10 stays untagged.
const importedTags: string[][] = [
  [PA, "sepsis"],
  [PA, "sepsis"],
  [PA, "sepsis"],
  [PA, "sepsis"],
  [PA, "renal"],
  [PA, "renal"],
  ["sepsis", "Management of Care"],
  ["sepsis", "Management of Care"],
  [],
  [],
];

function tenItems(): string {
  const items = stems.map((value, index) => ({
    ...FIXTURES.multiple_choice.canonical,
    id: `tag-demo-${index + 1}`,
    stem: { kind: "markdown", value },
    tags: importedTags[index],
  }));
  return JSON.stringify({ format: "learn.v1", items });
}

const itemLinks = (page: Page) =>
  page.getByRole("list", { name: "Items" }).getByRole("link", { name: /^Tag demo item/ });
const filterBar = (page: Page) => page.getByRole("region", { name: "Filter by tag" });

test("an author tags items, then filters the bank to Physiological Adaptation plus sepsis", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, an import, an edit and several filtered loads: longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `Tags ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("textbox", { name: "Or paste JSON", exact: true }).fill(tenItems());
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(itemLinks(page)).toHaveCount(10);

  // Tag item 9 in its editor: a client need, a topic typed in another case, and a CJMM step.
  await itemLinks(page).filter({ hasText: "Tag demo item 9" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit item" })).toBeVisible();
  await page.getByRole("checkbox", { name: PA, exact: true }).check();
  await page.getByRole("textbox", { name: "Add topic tags" }).fill("Sepsis");
  await page.getByRole("textbox", { name: "Add topic tags" }).press("Enter");
  await expect(page.getByRole("list", { name: "Topic tags" }).getByRole("listitem")).toHaveText([
    "sepsis",
  ]);
  await page
    .getByRole("combobox", { name: "Clinical judgment step" })
    .selectOption({ label: "Step 1: Recognize Cues" });
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  await page.getByRole("link", { name: "Back to bank" }).click();

  // The list shows the step as a tag.
  await expect(itemLinks(page).filter({ hasText: "Tag demo item 9" })).toContainText(
    "Step 1: Recognize Cues",
  );

  // Physiological Adaptation, then sepsis: only items carrying both are left.
  await filterBar(page)
    .getByRole("link", { name: `${PA}, 7 items`, exact: true })
    .click();
  await expect(itemLinks(page)).toHaveCount(7);
  await filterBar(page).getByRole("link", { name: "sepsis, 5 items", exact: true }).click();
  await expect(page).toHaveURL(/\?tag=Physiological\+Adaptation&tag=sepsis$/);
  await expect(itemLinks(page)).toHaveCount(5);
  for (const stem of ["Tag demo item 1", "Tag demo item 4", "Tag demo item 9"]) {
    await expect(itemLinks(page).filter({ hasText: stem })).toHaveCount(1);
  }
  await expect(filterBar(page)).toContainText(`5 items have all of: ${PA}, sepsis.`);

  // The URL keeps the filter, and it combines with the folder view.
  await page.reload();
  await expect(itemLinks(page)).toHaveCount(5);
  await page
    .getByRole("navigation", { name: "Folders" })
    .getByRole("link", { name: "Unfiled", exact: true })
    .click();
  await expect(page).toHaveURL(/\?folder=unfiled&tag=Physiological\+Adaptation&tag=sepsis$/);
  await expect(itemLinks(page)).toHaveCount(5);
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/bank-tags.png`,
    fullPage: true,
  });

  // Removing one tag widens the list; clearing shows everything again.
  await filterBar(page).getByRole("link", { name: "Remove filter sepsis, 5 items" }).click();
  await expect(itemLinks(page)).toHaveCount(7);
  await filterBar(page).getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\?folder=unfiled$/);
  await expect(itemLinks(page)).toHaveCount(10);
});
