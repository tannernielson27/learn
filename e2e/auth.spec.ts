import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { latestSignInLink } from "./mailbox";
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
  await page.goto(link);

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

test("an account with no role signs in to No access yet and cannot open authoring", async ({
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
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await latestSignInLink(request, email, since));

  await expect(page).toHaveURL(/\/author\/no-access$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "No access yet", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/invite link your instructor shares/)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Item banks", exact: true }),
  ).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/no-access-yet.png`,
    fullPage: true,
  });

  // Every way into authoring comes back here, the home and a deep link alike.
  for (const path of [
    "/author",
    "/author/sessions",
    "/author/banks/00000000-0000-4000-8000-000000000002",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/author\/no-access$/);
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

test("a link that was already used sends the person back with a reason", async ({
  page,
  request,
}, testInfo) => {
  const email = uniqueEmail(testInfo.project.name);
  await page.goto("/sign-in");
  const link = await requestLink(page, request, email);

  await page.goto(link);
  await expect(page).toHaveURL(/\/author$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto(link);
  await expect(page).toHaveURL(/\/sign-in\?error=link/);
  // Next's route announcer is also role="alert", so match the alert by its message.
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "That sign-in link has expired or was already used." }),
  ).toHaveText("That sign-in link has expired or was already used. Ask for a new one.");
});
