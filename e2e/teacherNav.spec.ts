import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { findRetiredTerms } from "../src/lib/copy/retiredTerms";
import { signInAsInstructorInEmptyOrg } from "./signIn";

// #412: the teacher's navigation, and the glossary's words on the screens it leads to. A teacher
// in a workspace of their own, so nothing another spec named is on the page. Needs the local
// Supabase stack and a build pointed at it, like auth.spec.ts.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const DESTINATIONS = [
  ["Library", "/author"],
  ["Classes", "/author/classes"],
  ["Live sessions", "/author/sessions"],
  ["Workspace", "/author/workspace"],
] as const;

const nav = (page: Page) => page.getByRole("navigation", { name: "Main", exact: true });

/** All four places are linked, and the one the page belongs to is marked, and only that one. */
async function expectNav(page: Page, current: string, how: "page" | "true"): Promise<void> {
  const links = nav(page).getByRole("link");
  await expect(links).toHaveText(DESTINATIONS.map(([label]) => label));
  for (const [label, href] of DESTINATIONS) {
    await expect(links.filter({ hasText: label })).toHaveAttribute("href", href);
  }
  const marked = nav(page).locator("a[aria-current]");
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveText(current);
  await expect(marked).toHaveAttribute("aria-current", how);
}

/**
 * The page as it was sent and drawn, searched for the words the glossary retired: its text, its
 * `aria-label`, `title`, `placeholder` and `alt` attributes, and its title. The Get started
 * checklist is left out: its words live in src/lib/onboarding and belong to #416.
 */
async function drawnHtml(page: Page): Promise<string> {
  const html = await page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelector('[aria-labelledby="get-started-heading"]')?.remove();
    return body.innerHTML;
  });
  // The account's own address is data, not wording: e2e/signIn.ts starts every one with "author-".
  return html.replace(/author-[\w.+-]*(?:@[\w.-]+)?/g, "");
}

async function expectGlossaryWords(page: Page): Promise<void> {
  expect(findRetiredTerms(await drawnHtml(page), await page.title())).toEqual([]);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/** Nothing is wider than the screen, and every navigation link is a full tap target. */
async function expectFits(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  for (const link of await nav(page).getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}

test("a teacher reaches the library, classes, live sessions and the workspace from every page", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const project = testInfo.project.name;
  const shoot = (name: string) =>
    page.screenshot({ path: `test-results/screenshots/${project}/${name}.png`, fullPage: true });
  /** One of this story's screens: marked, in the glossary's words, accessible, and it fits. */
  async function expectScreen(current: string, how: "page" | "true", shot: string) {
    await expectNav(page, current, how);
    await expectGlossaryWords(page);
    await expectNoAxeViolations(page);
    await expectFits(page);
    await shoot(shot);
  }

  await signInAsInstructorInEmptyOrg(page, request, `nav-${project}`);
  await expect(page).toHaveTitle(/Library/);
  await expect(page.getByRole("heading", { level: 1, name: "Library", exact: true })).toBeVisible();
  await expectScreen("Library", "page", "teacher-library-empty");

  // The keyboard walks the four links in reading order, and Enter follows one.
  await nav(page).getByRole("link", { name: "Library", exact: true }).focus();
  for (const [label] of DESTINATIONS.slice(1)) {
    await page.keyboard.press("Tab");
    await expect(nav(page).getByRole("link", { name: label, exact: true })).toBeFocused();
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/author\/workspace$/);
  await expectScreen("Workspace", "page", "teacher-workspace");

  // One tap from there to each of the others.
  await nav(page).getByRole("link", { name: "Live sessions", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/sessions$/);
  await expectNav(page, "Live sessions", "page");
  await expectFits(page);

  await nav(page).getByRole("link", { name: "Classes", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes$/);
  await expectScreen("Classes", "page", "teacher-classes-empty");

  // A class is inside Classes: marked as where the teacher is, though it is not that page.
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill("NUR 310");
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "NUR 310", exact: true })).toBeVisible();
  await expectScreen("Classes", "true", "teacher-class");
  await page.goto("/author/classes");
  await expectScreen("Classes", "page", "teacher-classes");

  // A quiz, a new question and a folder view are inside the library.
  await nav(page).getByRole("link", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL(/\/author$/);
  await page.getByRole("textbox", { name: "Quiz name", exact: true }).fill("Cardiac week");
  await page.getByRole("button", { name: "Create quiz", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}$/);
  await expect(page).toHaveTitle(/Quiz/);
  const quizPath = new URL(page.url()).pathname;
  await expectScreen("Library", "true", "teacher-quiz-empty");

  await page
    .getByRole("navigation", { name: "Folders", exact: true })
    .getByRole("link", { name: "Not in a folder", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Not in a folder", exact: true }),
  ).toBeVisible();
  await expectScreen("Library", "true", "teacher-quiz-not-in-a-folder");

  await page.goto(`${quizPath}?status=archived`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Archived questions", exact: true }),
  ).toBeVisible();
  await expectNav(page, "Library", "true");
  await expectGlossaryWords(page);

  // Pages this story does not reword still carry the navigation: the new question page here.
  await page.goto(`${quizPath}/new`);
  await expectNav(page, "Library", "true");
  await expectFits(page);

  // Back in the library, the quiz is listed by the new words.
  await nav(page).getByRole("link", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL(/\/author$/);
  await expect(
    page
      .getByRole("list", { name: "Quizzes", exact: true })
      .getByRole("link", { name: /Cardiac week/ }),
  ).toContainText("0 questions");
  await expectScreen("Library", "page", "teacher-library");
});

test("the retired terms check can fail: it finds an old word put on a drawn page", async ({
  page,
  request,
}, testInfo) => {
  await signInAsInstructorInEmptyOrg(page, request, `nav-control-${testInfo.project.name}`);
  await expectGlossaryWords(page);
  // The control: the same check, on the same page, once one old heading and one old label are on it.
  await page.evaluate(() => {
    document.querySelector("h1")!.textContent = "Item banks";
    document.querySelector("main")!.setAttribute("aria-label", "Unfiled");
  });
  const found = findRetiredTerms(await drawnHtml(page)).map((hit) => hit.found);
  expect(found).toEqual(["banks", "Item", "Unfiled"]);
});
