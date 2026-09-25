import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { latestSignInLink } from "./mailbox";
import { signInAsInstructorInEmptyOrg } from "./signIn";

// #266: every empty list says what it is for and what to do next. A fresh instructor in an org of
// their own, and a student in their class with nothing assigned. Needs the local Supabase stack
// (auth, the Mailpit test mailbox) and a build pointed at it, like auth.spec.ts.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/** An empty state: its heading at the level the page gives it, inside a marked, non-blank region. */
async function expectEmptyState(page: Page, level: number, name: string): Promise<void> {
  const heading = page.getByRole("heading", { level, name, exact: true });
  await expect(heading).toBeVisible();
  const region = page.locator("[data-empty-state]").filter({ has: heading });
  await expect(region).toHaveCount(1);
  // Heading, one sentence under it: never a blank frame.
  await expect(region.locator("p")).not.toHaveText("");
}

async function shoot(page: Page, project: string, name: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${project}/${name}.png`,
    fullPage: true,
  });
}

test("a fresh instructor and their first student see what to do next on every empty list", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const project = testInfo.project.name;
  await signInAsInstructorInEmptyOrg(page, request, `empty-${project}`);

  // Author home: no banks yet, with a link down to the form that makes one.
  await expectEmptyState(page, 2, "No item banks yet");
  await expect(page.getByRole("link", { name: "Create a bank", exact: true })).toHaveAttribute(
    "href",
    "#new-bank-heading",
  );
  await expectNoAxeViolations(page);
  await shoot(page, project, "author-home-empty");

  // Live sessions: none yet, with a link back to the banks they start from.
  await page.getByRole("link", { name: "Live sessions and reports", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/sessions$/);
  await expectEmptyState(page, 2, "No live sessions yet");
  await expect(
    page.getByRole("link", { name: "Go to your item banks", exact: true }),
  ).toHaveAttribute("href", "/author");
  await expectNoAxeViolations(page);
  await shoot(page, project, "sessions-empty");

  // Classes: none yet, with a link to the New class form below; keyboard reaches it.
  await page.goto("/author/classes");
  await expectEmptyState(page, 2, "No classes yet");
  const createClass = page.getByRole("link", { name: "Create a class", exact: true });
  await expect(createClass).toHaveAttribute("href", "#new-class-heading");
  await createClass.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#new-class-heading$/);
  await expectNoAxeViolations(page);
  await shoot(page, project, "classes-empty");

  // A new class: nobody on the roster and nothing assigned, each saying where to go.
  const className = `Empty states ${Date.now() % 100_000}`;
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(className);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  await expectEmptyState(page, 3, "Nobody has joined yet");
  await expect(
    page.getByRole("link", { name: "Go to the invite link", exact: true }),
  ).toHaveAttribute("href", "#invite-heading");
  await expectEmptyState(page, 3, "No assignments yet");
  await expectNoAxeViolations(page);
  const invite = await page.getByRole("textbox", { name: "Invite link", exact: true }).inputValue();

  // A new bank: no items and no case studies, the first linking to writing one.
  await page.goto("/author");
  const bankName = `Empty bank ${Date.now() % 100_000}`;
  await page.getByRole("textbox", { name: "Bank name", exact: true }).fill(bankName);
  await page.getByRole("button", { name: "Create bank", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}$/);
  const bankPath = new URL(page.url()).pathname;
  await expectEmptyState(page, 3, "No items in this bank yet");
  await expect(
    page.getByRole("link", { name: "Write the first item", exact: true }),
  ).toHaveAttribute("href", `${bankPath}/new`);
  await expectEmptyState(page, 3, "No case studies in this bank yet");
  await expectNoAxeViolations(page);

  // The student joins through the invite link and finds nothing assigned yet.
  const phone = await browser.newContext();
  const student = await phone.newPage();
  await student.goto(invite);
  const email = `student-empty-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const since = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await expect(
    student.getByRole("heading", { name: "Check your email", exact: true }),
  ).toBeVisible();
  await student.goto(await latestSignInLink(request, email, since));
  await expect(student).toHaveURL(/\/learn$/);

  await expect(student.getByRole("list", { name: "Your classes", exact: true })).toContainText(
    className,
  );
  await expectEmptyState(student, 3, "Nothing is open right now");
  await expectEmptyState(student, 3, "Nothing is shared for practice yet");
  await expectEmptyState(student, 3, "Nothing has closed yet");
  await expectEmptyState(student, 3, "Nothing to show yet");
  await expect(student.locator("[data-empty-state]")).toHaveCount(4);
  await expectNoAxeViolations(student);
  await shoot(student, project, "student-home-empty");

  await phone.close();
});
