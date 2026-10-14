import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { findRetiredTerms } from "../src/lib/copy/retiredTerms";
import { fillMultipleChoice, publishOpenItem } from "./authoringHelpers";
import { signInAsInstructorInEmptyOrg } from "./signIn";

// #411: folders in the library that hold quizzes. A teacher in a workspace of their own, so the
// library holds only what this spec makes. Needs the local Supabase stack, like auth.spec.ts.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/** Nothing on the page is wider than the screen. */
async function expectFits(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** The page's words are the glossary's (the account's own address is data, not wording). */
async function expectGlossaryWords(page: Page): Promise<void> {
  const html = (
    await page.evaluate(() => {
      const body = document.body.cloneNode(true) as HTMLElement;
      body.querySelector('[aria-labelledby="get-started-heading"]')?.remove();
      return body.innerHTML;
    })
  ).replace(/author-[\w.+-]*(?:@[\w.-]+)?/g, "");
  expect(findRetiredTerms(html, await page.title())).toEqual([]);
}

async function createQuiz(page: Page, name: string): Promise<string> {
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create quiz", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  return new URL(page.url()).pathname;
}

const folderList = (page: Page) => page.getByRole("list", { name: "Folders", exact: true });
const quizList = (page: Page) => page.getByRole("list", { name: "Quizzes", exact: true });

test("a teacher makes a folder, moves two quizzes into it, and starts a live session from one", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, two quizzes, a published question, a folder, a move and a live session.
  test.slow();
  const project = testInfo.project.name;
  const shoot = (name: string) =>
    page.screenshot({ path: `test-results/screenshots/${project}/${name}.png`, fullPage: true });
  await signInAsInstructorInEmptyOrg(page, request, `library-${project}`);

  // Two quizzes; the first gets a published question so it can be run.
  const cardiac = await createQuiz(page, "Cardiac week");
  // A new quiz offers no folders inside it (#411).
  await expect(page.getByRole("navigation", { name: "Folders", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "New question", exact: true }).click();
  await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
  await fillMultipleChoice(
    page,
    "Which finding is expected?",
    ["Bradycardia", "Tachycardia", "Hypotension", "Bounding pulses"],
    1,
  );
  await publishOpenItem(page);
  await createQuiz(page, "Renal week");

  // A workspace with no folders looks as before: its quizzes, and a closed New folder.
  await page.goto("/author");
  await expect(quizList(page).getByRole("link")).toHaveCount(2);
  await expect(folderList(page)).toHaveCount(0);

  await page.getByText("New folder", { exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name", exact: true }).fill("Med-Surg");
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  const medSurg = folderList(page).getByRole("link", { name: /^Med-Surg/ });
  await expect(medSurg).toContainText("No quizzes");
  await expectNoAxeViolations(page);
  await expectGlossaryWords(page);
  await expectFits(page);
  await shoot("library-with-folder");

  // Both quizzes into the folder, in one move.
  await page.getByRole("checkbox", { name: "Select Cardiac week", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select Renal week", exact: true }).check();
  await page
    .getByRole("combobox", { name: "Move selected to" })
    .selectOption({ label: "Med-Surg" });
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(medSurg).toContainText("2 quizzes");
  // Every quiz is filed, so the top of the library is its folders.
  await expect(quizList(page)).toHaveCount(0);
  await shoot("library-all-filed");

  // Open the folder from the keyboard.
  await medSurg.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/author\?folder=[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Med-Surg", exact: true }),
  ).toBeVisible();
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.getByRole("link", { name: "Library", exact: true })).toHaveAttribute(
    "href",
    "/author",
  );
  await expect(quizList(page).getByRole("link")).toHaveCount(2);
  await expectNoAxeViolations(page);
  await expectGlossaryWords(page);
  await expectFits(page);
  await shoot("library-folder");

  // A folder that holds quizzes is never deleted; it says what is inside instead.
  await page.getByRole("button", { name: "Delete folder", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: '"Med-Surg" holds 2 quizzes.' }),
  ).toContainText("Move them out first.");

  // Open a quiz from the folder: its breadcrumbs lead back through it.
  await quizList(page)
    .getByRole("link", { name: /Cardiac week/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`${cardiac}$`));
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Med-Surg" }),
  ).toBeVisible();

  // Filing changed nothing a live session reads: it starts as before.
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("join-code")).toBeVisible();
});

test("a folder is renamed, holds one more level of folders and no deeper, and an empty one is deleted", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  await signInAsInstructorInEmptyOrg(page, request, `library-tree-${testInfo.project.name}`);

  await page.getByText("New folder", { exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name", exact: true }).fill("Pediatrics");
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  await folderList(page)
    .getByRole("link", { name: /^Pediatrics/ })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Pediatrics", exact: true }),
  ).toBeVisible();

  await page.locator("summary").filter({ hasText: "Rename folder" }).click();
  await page.getByRole("textbox", { name: "New name", exact: true }).fill("Peds");
  await page.getByRole("button", { name: "Rename folder", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Peds", exact: true })).toBeVisible();

  // One level of folders inside it; inside that, none.
  await page.getByText("New folder", { exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name", exact: true }).fill("Week 1");
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  await folderList(page)
    .getByRole("link", { name: /^Week 1/ })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Week 1", exact: true })).toBeVisible();
  await expect(page.getByText("New folder", { exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page);

  // An empty folder is deleted, and its parent opens.
  await page.getByRole("button", { name: "Delete folder", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Peds", exact: true })).toBeVisible();
  await expect(folderList(page)).toHaveCount(0);
});
