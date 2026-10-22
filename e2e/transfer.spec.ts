import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sampleCaseStudy } from "../src/lib/ngn/fixtures/case-study";
import { seedQuiz } from "./seedQuiz";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

async function createBank(page: Page, name: string) {
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(name);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("an author exports a case study as learn.v1 with its six steps", async ({
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

  // Seed the source bank with a case study, then export it from its builder.
  await createBank(page, `Source ${stamp}`);
  await seedQuiz(page, request, JSON.stringify({ format: "learn.v1", caseStudy: sampleCaseStudy }));
  await listedCase().click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export JSON" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^case-study-[0-9a-f-]{36}\.learn\.json$/);
  const exported = await readFile(await download.path(), "utf8");
  expect(JSON.parse(exported)).toMatchObject({ format: "learn.v1", caseStudy: { title } });
  expect(JSON.parse(exported).caseStudy.items).toHaveLength(6);
  await expectNoAxeViolations(page);
});
