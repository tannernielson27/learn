import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { confirmLinkIn, latestEmail, latestSignInLink, openSignInLink } from "./mailbox";
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
  await student
    .getByRole("button", { name: "Join with an emailed link instead", exact: true })
    .click();
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await expect(
    student.getByRole("heading", { name: "Check your email", exact: true }),
  ).toBeVisible();

  // #307: the emailed link is /auth/confirm on the site the student is using, carrying next.
  // A link on another origin is how #304 broke; on the hosted project `pnpm golive:check` with
  // SUPABASE_ACCESS_TOKEN checks the allow-list that decides it.
  const link = new URL(await latestSignInLink(request, email, since));
  expect(link.origin).toBe(new URL(student.url()).origin);
  expect(link.pathname).toBe("/auth/confirm");
  expect(link.searchParams.get("next")).toBe("/learn");
  expect(link.searchParams.get("token_hash")).toBeTruthy();
  await openSignInLink(student, link.toString());
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
  await expectNoAxeViolations(page);
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

test("a student joins with an email and a password, with no email to wait for", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const project = testInfo.project.name;
  await signInAsNewAuthor(page, request, `classes-password-${project}`);
  const className = `NUR 320 — Fall ${Date.now() % 100_000}`;
  const invite = await createClass(page, className);

  const phone = await browser.newContext();
  const student = await phone.newPage();
  await student.goto(invite);
  const email = studentEmail(`password-${project}`);
  const password = "correct horse battery";
  // #358: a name, which the instructor's roster shows in place of the address.
  const name = `Ana Reyes ${Date.now() % 100_000}`;
  const since = new Date();
  await student.getByRole("textbox", { name: "Your name", exact: true }).fill(name);
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByLabel("Password", { exact: true }).fill(password);
  await expectNoAxeViolations(student);
  await student.getByRole("button", { name: "Join the class", exact: true }).click();

  // In the class at once, and asked, not made, to confirm the address.
  await expect(student).toHaveURL(/\/learn$/);
  await expect(student.getByRole("list", { name: "Your classes", exact: true })).toContainText(
    className,
  );
  await expect(
    student.getByRole("heading", { name: "Confirm your email address", exact: true }),
  ).toBeVisible();
  await expectNoAxeViolations(student);
  await student.screenshot({
    path: `test-results/screenshots/${project}/student-home-unconfirmed.png`,
    fullPage: true,
  });
  // The header shows the name rather than the address.
  await expect(student.getByTestId("signed-in-name")).toHaveText(name);
  await page.reload();
  const roster = page.getByRole("list", { name: "Roster", exact: true });
  await expect(roster).toContainText(name);
  await expect(roster).toContainText(email);

  // #360: the email is the app's welcome, not the sign-in email; opening its link is what confirms.
  const welcome = await latestEmail(request, email, since);
  expect(welcome.subject).toBe("Welcome to LeaRN: confirm your email address");
  expect(welcome.body).toContain("Confirm my email address");
  expect(welcome.body).not.toContain("sign-in page");
  // It has a plain-text part, carrying the same link.
  const welcomeLink = confirmLinkIn(welcome.body, email);
  expect(welcome.text).toContain(welcomeLink);
  expect(new URL(welcomeLink).searchParams.get("next")).toBe("/learn");
  await openSignInLink(student, welcomeLink);
  await expect(student).toHaveURL(/\/learn$/);
  await expect(
    student.getByRole("heading", { name: "Confirm your email address", exact: true }),
  ).toHaveCount(0);

  // Back another day: the password signs in on its own.
  await student.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(student).toHaveURL(/\/sign-in$/);
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByLabel("Password", { exact: true }).fill(password);
  await student.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(student.getByTestId("signed-in-name")).toHaveText(name);

  // The header's Account link: the name can be changed there, and the roster follows.
  await student.getByRole("link", { name: "Account", exact: true }).click();
  await expect(student).toHaveURL(/\/account$/);
  await expect(
    student.getByRole("heading", { level: 1, name: "Your account", exact: true }),
  ).toBeVisible();
  const nameField = student.getByRole("textbox", { name: "Your name", exact: true });
  await expect(nameField).toHaveValue(name);
  await expectNoAxeViolations(student);
  await student.screenshot({
    path: `test-results/screenshots/${project}/account.png`,
    fullPage: true,
  });
  const renamed = `${name} Lee`;
  await nameField.fill(renamed);
  await student.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(student.getByRole("status").filter({ hasText: "Name saved." })).toBeVisible();
  await expect(
    student.getByRole("link", { name: "Change your password", exact: true }),
  ).toHaveAttribute("href", "/account/password?next=%2Faccount");
  await student.goto("/learn");
  await expect(student.getByTestId("signed-in-name")).toHaveText(renamed);
  await page.reload();
  await expect(page.getByRole("list", { name: "Roster", exact: true })).toContainText(renamed);

  // The same form on an invite, with someone else's password, says the address is taken.
  await student.getByRole("button", { name: "Sign out", exact: true }).click();
  // Wait for it: leaving at once would cancel the sign-out and find the student still in.
  await expect(student).toHaveURL(/\/sign-in$/);
  await student.goto(invite);
  await student.getByRole("textbox", { name: "Your name", exact: true }).fill(name);
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByLabel("Password", { exact: true }).fill("not the password");
  await student.getByRole("button", { name: "Join the class", exact: true }).click();
  await expect(
    student.getByRole("alert").filter({ hasText: "already has a LeaRN account" }),
  ).toBeVisible();
  await phone.close();
});
