import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { latestSignInLink } from "./mailbox";
import {
  createAccountWithoutRole,
  insertAsAdmin,
  selectAsAdmin,
  uniqueEmail,
  updateAsAdmin,
} from "./signIn";

// #265: the Get started checklist on the author home, and the sample bank import. Needs the local
// Supabase stack (auth, the Mailpit test mailbox) and a build pointed at it, like auth.spec.ts.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/**
 * A brand-new instructor alone in a brand-new org, so the checklist starts from nothing. The
 * owner's steps (docs/05 §7.6) are Add user then `private.make_instructor`, which always joins the
 * first org; this does the same two steps but points the profile at an org of its own.
 */
async function signInAsInstructorInEmptyOrg(
  page: Page,
  request: APIRequestContext,
  label: string,
): Promise<string> {
  const org = await insertAsAdmin<{ id: string }>(request, "orgs", { name: `Onboarding ${label}` });
  const email = uniqueEmail(label);
  const userId = await createAccountWithoutRole(request, email);
  await updateAsAdmin(request, "profiles", `id=eq.${userId}`, {
    org_id: org.id,
    role: "instructor",
  });

  await page.goto("/sign-in");
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email", exact: true })).toBeVisible();
  await page.goto(await latestSignInLink(request, email, since));
  await expect(page).toHaveURL(/\/author$/);
  return org.id;
}

function stepRow(checklist: Locator, title: string): Locator {
  return checklist
    .getByRole("list", { name: "Steps", exact: true })
    .getByRole("listitem")
    .filter({
      has: checklist.page().getByText(title, { exact: true }),
    });
}

test("a new instructor imports the sample from Get started, then hides it", async ({
  page,
  request,
}, testInfo) => {
  const project = testInfo.project.name;
  const orgId = await signInAsInstructorInEmptyOrg(page, request, `onboarding-${project}`);

  const checklist = page.getByRole("region", { name: "Get started", exact: true });
  await expect(checklist).toBeVisible();
  const steps = checklist.getByRole("list", { name: "Steps", exact: true }).getByRole("listitem");
  await expect(steps).toHaveCount(3);
  for (const title of [
    "Make a bank or import the sample",
    "Make a class",
    "Assign work or run a live session",
  ]) {
    await expect(stepRow(checklist, title).getByText("Not done", { exact: true })).toBeVisible();
  }
  await expect(checklist.getByText("0 of 3 done", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${project}/get-started.png`,
    fullPage: true,
  });

  await checklist.getByRole("button", { name: "Import the sample bank", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sample bank", exact: true }),
  ).toBeVisible();
  const bankId = page.url().split("/").pop();

  // Every sample row landed in this instructor's org, and nowhere else.
  const banks = await selectAsAdmin<{ id: string; name: string }>(
    request,
    "item_banks",
    `select=id,name&org_id=eq.${orgId}`,
  );
  expect(banks).toEqual([{ id: bankId, name: "Sample bank" }]);
  const items = await selectAsAdmin<{ org_id: string }>(
    request,
    "items",
    `select=org_id&bank_id=eq.${bankId}`,
  );
  expect(items.length).toBeGreaterThanOrEqual(21);
  expect(new Set(items.map((item) => item.org_id))).toEqual(new Set([orgId]));

  await page.goto("/author");
  const bankStep = stepRow(checklist, "Make a bank or import the sample");
  await expect(bankStep.getByText("Done", { exact: true })).toBeVisible();
  await expect(checklist.getByText("1 of 3 done", { exact: true })).toBeVisible();
  // A second import is a link to the same bank, not another copy.
  await expect(
    checklist.getByRole("button", { name: "Import the sample bank", exact: true }),
  ).toHaveCount(0);
  await expect(
    checklist.getByRole("link", { name: "Open the sample bank", exact: true }),
  ).toHaveAttribute("href", `/author/banks/${bankId}`);
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${project}/get-started-step-done.png`,
    fullPage: true,
  });

  // Hide this, from the keyboard, lasts across a reload.
  await checklist.getByRole("button", { name: "Hide this", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(checklist).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Item banks", exact: true }),
  ).toBeVisible();
  await expect(checklist).toHaveCount(0);
});
