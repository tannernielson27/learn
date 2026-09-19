import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import { sampleCaseStudy } from "../src/lib/ngn/fixtures/case-study";
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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const title = sampleCaseStudy.title;
const originalStep3 = "Complete the following sentence by choosing from the lists of options.";
const itemStem = "Duplicate demo item";

test("an author duplicates a case study, changes step 3 in the copy, and the original is unchanged", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, two imports, two copies and a save: longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `Duplicate ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  const bankUrl = page.url();

  await importJson(page, JSON.stringify({ format: "learn.v1", caseStudy: sampleCaseStudy }));
  const cases = page.getByRole("list", { name: "Case studies" });
  const original = cases
    .getByRole("link", { name: new RegExp(`^${escapeRegExp(title)}`) })
    .filter({ hasNotText: "(copy)" });
  const copy = cases.getByRole("link", { name: new RegExp(`^${escapeRegExp(title)} \\(copy\\)`) });

  // Duplicate the case study: the builder opens on the copy, a draft.
  await original.click();
  await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
  const originalUrl = page.url();
  await page.getByRole("button", { name: "Duplicate case study", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `${title} (copy)`, exact: true }),
  ).toBeVisible();
  expect(page.url()).not.toBe(originalUrl);
  expect(page.url()).toMatch(/\/author\/case-studies\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/duplicated-case-study.png`,
    fullPage: true,
  });

  // Change step 3 in the copy.
  const rail = page.getByRole("navigation", { name: "Case study steps" });
  const step3 = rail.getByRole("button", { name: /^Step 3:/ });
  const stem = page.getByRole("textbox", { name: "Question stem", exact: true });
  await step3.click();
  await expect(stem).toHaveValue(originalStep3);
  await stem.fill("Changed in the copy only.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();

  // The bank lists both; the original's step 3 is unchanged.
  await page.goto(bankUrl);
  await expect(copy).toContainText("Draft");
  await expect(copy).toContainText("6 of 6 steps");
  await original.click();
  await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
  await rail.getByRole("button", { name: /^Step 3:/ }).click();
  await expect(stem).toHaveValue(originalStep3);
});

test("an author duplicates an item and the copy opens as a draft marked (copy)", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `Duplicate item ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  const bankUrl = page.url();

  const item = {
    ...FIXTURES.multiple_choice.canonical,
    id: "duplicate-demo",
    stem: { kind: "markdown", value: itemStem },
  };
  await importJson(page, JSON.stringify({ format: "learn.v1", items: [item] }));
  const items = page.getByRole("list", { name: "Items" });
  await items.getByRole("link", { name: new RegExp(`^${itemStem}`) }).click();
  await expect(page.getByRole("textbox", { name: "Question stem", exact: true })).toHaveValue(
    itemStem,
  );

  const originalUrl = page.url();
  await page.getByRole("button", { name: "Duplicate item", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Question stem", exact: true })).toHaveValue(
    `(copy) ${itemStem}`,
  );
  expect(page.url()).not.toBe(originalUrl);
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/duplicated-item.png`,
    fullPage: true,
  });

  await page.goto(bankUrl);
  await expect(items.getByRole("link", { name: new RegExp(`^${itemStem}`) })).toBeVisible();
  await expect(items.getByRole("link", { name: /^\(copy\) Duplicate demo item/ })).toBeVisible();
});
