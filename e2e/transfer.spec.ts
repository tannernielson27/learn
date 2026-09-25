import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sampleCaseStudy } from "../src/lib/ngn/fixtures/case-study";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

async function createBank(page: Page, name: string) {
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name" }).fill(name);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function importJson(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Or paste JSON", exact: true }).fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("an author exports a case study and imports the copy into another bank as a draft with six steps", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const stamp = `${testInfo.project.name} ${Date.now()}`;
  const title = sampleCaseStudy.title;
  const listedCase = () =>
    page
      .getByRole("list", { name: "Case studies" })
      .getByRole("link", { name: new RegExp(`^${escapeRegExp(title)}`) });

  // A refused import says why and writes nothing.
  await createBank(page, `Source ${stamp}`);
  await importJson(page, "{ not json");
  const refused = page.getByRole("alert").filter({ hasText: "Nothing was imported." });
  await expect(refused).toContainText("This is not valid JSON.");
  await expect(
    page.getByRole("heading", { name: "No case studies in this bank yet", exact: true }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  // Seed the source bank with a case study, then export it from its builder.
  await importJson(page, JSON.stringify({ format: "learn.v1", caseStudy: sampleCaseStudy }));
  await expect(
    page.getByRole("status").filter({ hasText: `Imported the case study "${title}"` }),
  ).toBeVisible();
  await listedCase().click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export JSON" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^case-study-[0-9a-f-]{36}\.learn\.json$/);
  const exported = await readFile(await download.path(), "utf8");
  expect(JSON.parse(exported)).toMatchObject({ format: "learn.v1", caseStudy: { title } });
  // Checked here, apart from the import, so a lost step points at the export.
  expect(JSON.parse(exported).caseStudy.items).toHaveLength(6);

  // Import the export into a second bank: a new draft with all six steps.
  await createBank(page, `Copy ${stamp}`);
  await importJson(page, exported);
  await expect(
    page.getByRole("status").filter({ hasText: "and its six steps as drafts." }),
  ).toBeVisible();
  await expect(listedCase()).toContainText("Draft");
  await expect(listedCase()).toContainText("6 of 6 steps");
  await expectNoAxeViolations(page);

  await listedCase().click();
  const rail = page.getByRole("navigation", { name: "Case study steps" });
  await expect(rail.getByRole("button", { name: /^Record/ })).toContainText("Ready");
  for (const step of [1, 2, 3, 4, 5, 6]) {
    await expect(rail.getByRole("button", { name: new RegExp(`^Step ${step}:`) })).toContainText(
      "Draft",
    );
  }
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/imported-case-study.png`,
    fullPage: true,
  });
});
