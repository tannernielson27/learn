import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { latestSignInLink } from "./mailbox";

// Needs the local Supabase stack (auth + test mailbox) and a build pointed at it; the preview
// e2e job has neither, so it skips. CI runs this in the `auth-e2e` job with E2E_AUTH=1.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

function uniqueEmail(projectName: string): string {
  return `author-${projectName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function requestLink(page: Page, request: APIRequestContext, email: string): Promise<string> {
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
