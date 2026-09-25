import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { latestSignInLink } from "./mailbox";
import { signInAsNewAuthor } from "./signIn";

// #205: a class, its invite link, and a student who joins through it. Needs the local Supabase
// stack (auth, the Mailpit test mailbox) and a build pointed at it, like auth.spec.ts.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

function studentEmail(label: string): string {
  return `student-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

async function createClass(page: Page, name: string): Promise<string> {
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Classes", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  return page.getByRole("textbox", { name: "Invite link", exact: true }).inputValue();
}

test("a student joins a class from its invite link and the roster shows them", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const project = testInfo.project.name;
  await signInAsNewAuthor(page, request, `classes-${project}`);
  const className = `NUR 310 — Fall ${Date.now() % 100_000}`;
  const invite = await createClass(page, className);
  expect(invite).toMatch(/\/c\/[A-Za-z0-9_-]{32}$/);
  await expect(
    page.getByRole("img", { name: `QR code for the ${className} invite link`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nobody has joined yet", exact: true }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  // The student, on their own phone: not signed in.
  const phone = await browser.newContext();
  const student = await phone.newPage();
  await student.goto(invite);
  await expect(
    student.getByRole("heading", { level: 1, name: `Join ${className}`, exact: true }),
  ).toBeVisible();
  await expectNoAxeViolations(student);
  await student.screenshot({
    path: `test-results/screenshots/${project}/class-invite.png`,
    fullPage: true,
  });

  const email = studentEmail(project);
  const since = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await expect(
    student.getByRole("heading", { name: "Check your email", exact: true }),
  ).toBeVisible();

  await student.goto(await latestSignInLink(request, email, since));
  await expect(student).toHaveURL(/\/learn$/);
  await expect(
    student.getByRole("heading", { level: 1, name: "Your classes", exact: true }),
  ).toBeVisible();
  await expect(student.getByRole("list", { name: "Your classes", exact: true })).toContainText(
    className,
  );
  await expect(student.getByTestId("signed-in-email")).toHaveText(email);
  await expectNoAxeViolations(student);
  await student.screenshot({
    path: `test-results/screenshots/${project}/student-home.png`,
    fullPage: true,
  });

  // A student is not an author: authoring sends them home rather than to "No access yet".
  await student.goto("/author");
  await expect(student).toHaveURL(/\/learn$/);

  // The instructor sees them on the roster, signed in.
  await page.reload();
  const roster = page.getByRole("list", { name: "Roster", exact: true });
  await expect(roster).toContainText(email);
  await expect(roster).not.toContainText("Has not signed in yet");
  await page.screenshot({
    path: `test-results/screenshots/${project}/class-roster.png`,
    fullPage: true,
  });

  // Replacing the link kills the old one at once, and a stranger cannot tell it from nonsense.
  await page.getByRole("button", { name: "Replace the link", exact: true }).click();
  await page.getByRole("button", { name: "Replace it now", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Invite link", exact: true })).not.toHaveValue(
    invite,
  );
  // A replacement that worked closes the question (#256); a failed one would keep it open.
  await expect(page.getByRole("button", { name: "Replace it now", exact: true })).toHaveCount(0);
  const stranger = await (await browser.newContext()).newPage();
  for (const target of [invite, "/c/not-a-token", "/c/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"]) {
    await stranger.goto(target);
    await expect(
      stranger.getByRole("heading", {
        level: 1,
        name: "This invite link does not work",
        exact: true,
      }),
    ).toBeVisible();
  }
  await expectNoAxeViolations(stranger);

  // Removing the student takes the class off their home; the account stays.
  // With the keyboard only (#272): the row goes away, and focus lands on the Roster heading
  // rather than falling to the document body.
  await page.getByRole("button", { name: `Remove ${email}`, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Remove from class", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Nobody has joined yet", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Roster", exact: true })).toBeFocused();
  await student.goto("/learn");
  await expect(student.getByText(/You are not in a class yet/)).toBeVisible();

  await phone.close();
});

test("an instructor who opens an invite link is told so and stays an instructor", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, `classes-inst-${testInfo.project.name}`);
  const invite = await createClass(page, `NUR 320 ${Date.now() % 100_000}`);

  await page.goto(invite);
  await expect(page.getByText(/You are already an instructor/)).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto("/author");
  await expect(
    page.getByRole("heading", { level: 1, name: "Item banks", exact: true }),
  ).toBeVisible();
});
