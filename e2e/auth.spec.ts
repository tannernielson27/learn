import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { latestSignInCode, latestSignInLink, openSignInLink } from "./mailbox";
import { createAccountWithoutRole, createAuthorAccount } from "./signIn";

// Needs the local Supabase stack (auth + test mailbox) and a build pointed at it; the preview
// e2e job has neither, so it skips. CI runs this in the `auth-e2e` job with E2E_AUTH=1.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

function uniqueEmail(projectName: string): string {
  return `author-${projectName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function requestLink(page: Page, request: APIRequestContext, email: string): Promise<string> {
  // The form no longer signs anyone up (#139), so the account has to exist before the ask.
  await createAuthorAccount(request, email);
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page
    .getByRole("button", { name: "Sign in with an emailed link instead", exact: true })
    .click();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  return latestSignInLink(request, email, since);
}

test("an author signs in from an emailed link, lands where they were going, then signs out", async ({
  page,
  request,
}, testInfo) => {
  const email = uniqueEmail(testInfo.project.name);

  await page.goto("/author");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fauthor$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  const link = await requestLink(page, request, email);
  await openSignInLink(page, link);

  await expect(page).toHaveURL(/\/author$/);
  await expect(page.getByRole("heading", { level: 1, name: "Item banks" })).toBeVisible();
  await expect(page.getByTestId("signed-in-email")).toHaveText(email);

  // Signed in, the sign-in page moves straight on.
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/author$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/author");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fauthor$/);
});

test("an account with no role lands on the welcome page and cannot open authoring", async ({
  page,
  request,
}, testInfo) => {
  // #204: Add user and nothing else, which is what the sign-up trigger now leaves an account as.
  const email = uniqueEmail(`norole-${testInfo.project.name}`);
  await createAccountWithoutRole(request, email);

  await page.goto("/author");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fauthor$/);
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page
    .getByRole("button", { name: "Sign in with an emailed link instead", exact: true })
    .click();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await openSignInLink(page, await latestSignInLink(request, email, since));

  // #362: never "No access yet". The welcome page has both ways forward.
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome to LeaRN", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Class code", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Set up my workspace", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Item banks", exact: true }),
  ).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/welcome-no-role.png`,
    fullPage: true,
  });

  // Every way into authoring comes back here: the home, a deep link, and the old address.
  for (const path of [
    "/author",
    "/author/sessions",
    "/author/banks/00000000-0000-4000-8000-000000000002",
    "/author/no-access",
    "/learn",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/welcome$/);
  }

  await page.getByRole("main").getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("the demo account signs in without an email and lands where the person was going", async ({
  page,
}) => {
  test.skip(!process.env.DEMO_ACCOUNT_EMAIL, "set DEMO_ACCOUNT_EMAIL and DEMO_ACCOUNT_PASSWORD");

  await page.goto("/author");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fauthor$/);
  await expect(page.getByRole("heading", { level: 2, name: "Try the demo" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByRole("button", { name: "Use the demo account" }).click();
  await expect(page).toHaveURL(/\/author$/);
  await expect(page.getByRole("heading", { level: 1, name: "Item banks" })).toBeVisible();
  await expect(page.getByTestId("signed-in-email")).toHaveText(
    process.env.DEMO_ACCOUNT_EMAIL!.trim().toLowerCase(),
  );

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a mail scanner that opens the link first spends nothing (#305)", async ({
  page,
  request,
}, testInfo) => {
  const email = uniqueEmail(`scanner-${testInfo.project.name}`);
  await page.goto("/sign-in");
  const link = await requestLink(page, request, email);

  // What Safe Links and its kind do: fetch the address, follow redirects, read the page.
  const scanned = await request.get(link);
  expect(scanned.ok()).toBe(true);
  expect(new URL(scanned.url()).pathname).toBe("/auth/confirm");
  expect(await scanned.text()).toContain("Continue to LeaRN");
  // Until the button is pressed the page holds a live token: no cache may keep a copy.
  expect(scanned.headers()["cache-control"]).toContain("no-store");

  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Finish signing in" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/finish-signing-in.png`,
  });
  await page.getByRole("button", { name: "Continue to LeaRN" }).click();
  await expect(page).toHaveURL(/\/author$/);
  await expect(page.getByTestId("signed-in-email")).toHaveText(email);
});

test("an author who opened the email elsewhere signs in here with its code (#306)", async ({
  page,
  request,
}, testInfo) => {
  const email = uniqueEmail(`code-${testInfo.project.name}`);
  await createAuthorAccount(request, email);
  await page.goto("/author");
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page
    .getByRole("button", { name: "Sign in with an emailed link instead", exact: true })
    .click();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const code = await latestSignInCode(request, email, since);
  const field = page.getByRole("textbox", { name: "Code from the email" });
  await field.fill("000000");
  await page.getByRole("button", { name: "Sign in with the code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That code did not work" })).toBeVisible();

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/sign-in-code.png`,
  });

  await field.fill(code);
  await page.getByRole("button", { name: "Sign in with the code" }).click();
  await expect(page).toHaveURL(/\/author$/);
  await expect(page.getByTestId("signed-in-email")).toHaveText(email);
});

test("a link that was already used sends the person back with a reason", async ({
  page,
  request,
}, testInfo) => {
  const email = uniqueEmail(testInfo.project.name);
  await page.goto("/sign-in");
  const link = await requestLink(page, request, email);

  await openSignInLink(page, link);
  await expect(page).toHaveURL(/\/author$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await openSignInLink(page, link);
  await expect(page).toHaveURL(/\/sign-in\?error=link/);
  // Next's route announcer is also role="alert", so match the alert by its message.
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "That sign-in link has expired or was already used." }),
  ).toHaveText(
    "That sign-in link has expired or was already used. Enter your email to get a new one.",
  );
});

test("an author chooses a password, then signs in with it and no email", async ({
  page,
  request,
}, testInfo) => {
  const email = uniqueEmail(`password-${testInfo.project.name}`);
  const password = "correct horse battery";

  // "Forgot your password?" is also how someone who never had one gets one: the emailed link
  // signs them in and lands on choosing it.
  await page.goto("/author");
  await createAuthorAccount(request, email);
  await page.getByRole("button", { name: "Forgot your password?", exact: true }).click();
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email", exact: true })).toBeVisible();
  await openSignInLink(page, await latestSignInLink(request, email, since));

  await expect(page).toHaveURL(/\/account\/password\?next=%2Fauthor$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose a password", exact: true }),
  ).toBeVisible();
  const choose = await new AxeBuilder({ page }).analyze();
  expect(choose.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/choose-password.png`,
  });

  await page.getByLabel("New password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Password saved", exact: true })).toHaveCount(0);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Password saved", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/author$/);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  const signIn = await new AxeBuilder({ page }).analyze();
  expect(signIn.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/sign-in-password.png`,
  });

  // A wrong password says so without saying whether the address has an account.
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("not the password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "That email and password do not match." }),
  ).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/author$/);
  await expect(page.getByTestId("signed-in-email")).toHaveText(email);
});

// #361: open sign-up. No account is made beforehand: the form is the only thing that makes one.
test("a new teacher signs up, with the keyboard, into an empty workspace of their own", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(`teacher-${testInfo.project.name}`);

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Create an account", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Create an account", exact: true }),
  ).toBeVisible();
  // The role comes first; nothing else is asked until it is chosen.
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toHaveCount(0);
  const choice = await new AxeBuilder({ page }).analyze();
  expect(choice.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/sign-up-role.png`,
  });

  await page.getByRole("radio", { name: /^I teach/ }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: /^I teach/ })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeFocused();
  await page.keyboard.type("Ada Lovelace");
  await page.keyboard.press("Tab");
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await page.keyboard.type("correct horse battery");
  const filled = await new AxeBuilder({ page }).analyze();
  expect(filled.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/sign-up-teacher.png`,
  });
  await page.keyboard.press("Enter");

  // Signed in at once, with no email to wait for, in a workspace that holds nothing of anyone's.
  await expect(page).toHaveURL(/\/author$/);
  // #364: a new teacher is welcomed by name, once. onboarding.spec.ts walks it; here it is skipped.
  await expect(
    page.getByRole("dialog", { name: "Welcome, Ada Lovelace", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: "Item banks", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "No item banks yet", exact: true }),
  ).toBeVisible();
  // The shared org's seeded bank is not theirs to see.
  await expect(page.getByRole("link", { name: "Samples", exact: true })).toHaveCount(0);

  // Signed in, the sign-up page moves straight on.
  await page.goto("/sign-up");
  await expect(page).toHaveURL(/\/author$/);

  // The same address again is told it has an account, and nothing else.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/sign-up?role=teacher");
  await expect(page.getByRole("radio", { name: /^I teach/ })).toBeChecked();
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Someone Else");
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("another long password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "This email already has an account." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up\?role=teacher$/);
});

test("a new student signs up and lands on the welcome page, with no role yet", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(`student-${testInfo.project.name}`);

  await page.goto("/sign-up?role=student");
  await expect(page.getByRole("radio", { name: /^I am a student/ })).toBeChecked();
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Sam Lee");
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  await expect(page).toHaveURL(/\/welcome$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome to LeaRN", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Join your class", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Signed in as Sam Lee.", { exact: true })).toBeVisible();
  const welcome = await new AxeBuilder({ page }).analyze();
  expect(welcome.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/welcome.png`,
  });

  // Signing up as a student gives no way into authoring.
  await page.goto("/author");
  await expect(page).toHaveURL(/\/welcome$/);

  // Signed out, the welcome page asks for a sign-in and comes back.
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fwelcome$/);
});
