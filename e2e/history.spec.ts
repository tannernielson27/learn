import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import { publishOpenItem } from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

const STEM = "History demo: which action should the nurse take first?";

function oneItem(): string {
  const item = {
    ...FIXTURES.multiple_choice.canonical,
    id: "history-demo-1",
    stem: { kind: "markdown", value: STEM },
  };
  return JSON.stringify({ format: "learn.v1", items: [item] });
}

const isCorrect = (page: Page, letter: string) =>
  page.getByRole("radio", { name: `Option ${letter} is correct`, exact: true });

test("an author publishes twice, previews version 1 and restores it as a draft", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, an import and three publishes: longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `History ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  await page.getByRole("textbox", { name: "Or paste JSON", exact: true }).fill(oneItem());
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("list", { name: "Items" }).getByRole("link", { name: STEM }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit item" })).toBeVisible();

  // Version 1 keys option A; version 2 keys option B.
  await expect(isCorrect(page, "A")).toBeChecked();
  await publishOpenItem(page);
  await isCorrect(page, "B").check();
  await publishOpenItem(page);
  // "Published." is still showing from the first publish, so wait for the second to land.
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(0);

  const history = page.getByRole("region", { name: "History", exact: true });
  await history.getByRole("button", { name: "History", exact: true }).click();
  const versions = history.getByRole("list", { name: "Published versions" });
  await expect(versions.getByRole("button")).toHaveCount(2);
  await versions.getByRole("button", { name: /^Version 1 / }).click();

  const version = history.getByRole("region", { name: "Version 1", exact: true });
  await expect(version.getByRole("list", { name: "Compared with the saved draft" })).toContainText(
    "The answer key changed.",
  );
  await expect(version.getByRole("region", { name: "Version 1 preview" })).toContainText(STEM);
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/item-history.png`,
    fullPage: true,
  });

  // Restoring loads version 1 into the editor without saving anything.
  await version.getByRole("button", { name: "Restore as draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Version 1 is loaded" })).toBeFocused();
  await expect(isCorrect(page, "A")).toBeChecked();
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();

  // Publishing the restored draft appends version 3; versions 1 and 2 stay as they were.
  await publishOpenItem(page);
  await history.getByRole("button", { name: "History", exact: true }).click();
  await expect(versions.getByRole("button")).toHaveCount(3);
  await versions.getByRole("button", { name: /^Version 1 / }).click();
  await expect(version).toContainText("Same as the saved draft.");
  await versions.getByRole("button", { name: /^Version 2 / }).click();
  await expect(
    history
      .getByRole("region", { name: "Version 2", exact: true })
      .getByRole("list", { name: "Compared with the saved draft" }),
  ).toContainText("The answer key changed.");
  await expectNoAxeViolations(page);
});
