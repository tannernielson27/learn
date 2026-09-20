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

async function importJson(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Or paste JSON", exact: true }).fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imported" })).toBeVisible();
}

const KEPT = "Archive demo item that stays";
const FILED = "Archive demo item to file away";

/** Two items only, so the bank's one page holds both however the list pages. */
const itemsJson = JSON.stringify({
  format: "learn.v1",
  items: [KEPT, FILED].map((stem, index) => ({
    ...FIXTURES.multiple_choice.canonical,
    id: `archive-demo-${index}`,
    stem: { kind: "markdown", value: stem },
  })),
});

test("an author archives an item, finds it in the Archived view, and restores it", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, an import, an archive and a restore: longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `Archive ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  const bankUrl = page.url();

  await importJson(page, itemsJson);
  const items = page.getByRole("list", { name: "Items" });
  const kept = items.getByRole("link", { name: new RegExp(`^${KEPT}`) });
  const filed = items.getByRole("link", { name: new RegExp(`^${FILED}`) });
  await expect(kept).toBeVisible();
  await expect(filed).toBeVisible();

  // Archive one item from its own page.
  await filed.click();
  await expect(page.getByRole("textbox", { name: "Question stem", exact: true })).toHaveValue(
    FILED,
  );
  await page.getByRole("button", { name: "Archive item", exact: true }).click();
  await expect(page.getByText("This item is archived.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore item", exact: true })).toBeVisible();
  await expectNoAxeViolations(page);

  // It has left the bank's list; the other item is still there.
  await page.goto(bankUrl);
  await expect(kept).toBeVisible();
  await expect(filed).toHaveCount(0);

  // The Archived view shows it, and only it.
  const views = page.getByRole("navigation", { name: "Current or archived" });
  await views.getByRole("link", { name: "Archived", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Archived items" })).toBeVisible();
  await expect(filed).toBeVisible();
  await expect(kept).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/bank-archived.png`,
    fullPage: true,
  });

  // Restore it from its row: the Archived view empties.
  await page.getByRole("button", { name: `Restore ${FILED}`, exact: true }).click();
  await expect(page.getByText("No archived items here.")).toBeVisible();

  // And it is back among the bank's current items.
  await views.getByRole("link", { name: "Current", exact: true }).click();
  await expect(kept).toBeVisible();
  await expect(filed).toBeVisible();
});
