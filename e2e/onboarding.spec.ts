import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { latestSignInLink, openSignInLink } from "./mailbox";
import {
  createAccountWithoutRole,
  insertAsAdmin,
  selectAsAdmin,
  signInAsNewAuthor,
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
  await page
    .getByRole("button", { name: "Sign in with an emailed link instead", exact: true })
    .click();
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email", exact: true })).toBeVisible();
  await openSignInLink(page, await latestSignInLink(request, email, since));
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

// #283: the sample arrives published, so a new instructor can assign it and run it live at once,
// with no publish step in between.
test("the imported sample is ready to assign and to run live straight away", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;
  const orgId = await signInAsInstructorInEmptyOrg(page, request, `sample-live-${project}`);
  const className = `Sample class ${project} ${Date.now() % 100_000}`;
  // The columns' defaults call private.new_invite_token() and private.new_class_join_code(), which
  // only `authenticated` may run, so the service role supplies a token of the same shape (32
  // base64url characters) and a class code (#356: 8 characters, no 0/O/1/I/L) itself.
  const codeAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  await insertAsAdmin(request, "classes", {
    org_id: orgId,
    name: className,
    invite_token: randomBytes(24).toString("base64url"),
    join_code: Array.from(randomBytes(8), (byte) => codeAlphabet[byte % codeAlphabet.length]).join(
      "",
    ),
  });

  const checklist = page.getByRole("region", { name: "Get started", exact: true });
  await expect(
    checklist.getByText("published, ready to assign or run live", { exact: false }),
  ).toBeVisible();
  await expect(checklist.getByText("Only published items are used", { exact: false })).toHaveCount(
    0,
  );
  await checklist.getByRole("button", { name: "Import the sample bank", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}$/);
  const bankUrl = page.url();
  const bankId = bankUrl.split("/").pop();

  // Every item, step and the case study landed published; no draft is left to publish by hand.
  const items = await selectAsAdmin<{ status: string }>(
    request,
    "items",
    `select=status&bank_id=eq.${bankId}`,
  );
  expect(items.length).toBeGreaterThanOrEqual(21);
  expect(new Set(items.map((item) => item.status))).toEqual(new Set(["published"]));
  const cases = await selectAsAdmin<{ status: string }>(
    request,
    "case_studies",
    `select=status&bank_id=eq.${bankId}`,
  );
  expect(cases).toEqual([{ status: "published" }]);

  // Assign: the form takes the bank as it is, and the assignment is listed on the class.
  await page.getByRole("link", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}\/assign$/);
  await page
    .getByRole("combobox", { name: "Class", exact: true })
    .selectOption({ label: className });
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${project}/sample-assign.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  await expect(
    page
      .getByRole("list", { name: "Assignments", exact: true })
      .getByRole("listitem")
      .filter({ hasText: "Sample bank" }),
  ).toHaveCount(1);

  // Start a live session: the lobby opens, where a bank with nothing published is refused.
  await page.goto(bankUrl);
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("join-code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start session", exact: true })).toBeEnabled();
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${project}/sample-live.png`,
    fullPage: true,
  });
});

// #364: the welcome a new teacher sees once. No account is made beforehand: signing up as a
// teacher is what makes a self-registered workspace.
test("a new teacher is welcomed in three steps, once, and lands on the checklist", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const email = uniqueEmail(`welcome-${project}`);
  await page.goto("/sign-up?role=teacher");
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Grace Hopper");
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/author$/);

  const dialog = page.getByRole("dialog");
  const count = dialog.getByRole("status");
  await expect(dialog).toHaveAccessibleName("Welcome, Grace Hopper");
  await expect(count).toHaveText("Step 1 of 3");
  await expect(dialog).toContainText("no other teacher can see them");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `test-results/screenshots/${project}/teacher-welcome-1.png` });

  // With the keyboard: Next keeps the focus, so Enter walks it.
  await dialog.getByRole("button", { name: "Next", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAccessibleName("Start with a question bank");
  await expect(count).toHaveText("Step 2 of 3");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `test-results/screenshots/${project}/teacher-welcome-2.png` });

  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAccessibleName("Then a class, and your first session");
  await expect(count).toHaveText("Step 3 of 3");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `test-results/screenshots/${project}/teacher-welcome-3.png` });

  // Back works, and the last button is the checklist's own name.
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(count).toHaveText("Step 2 of 3");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await dialog.getByRole("button", { name: "Get started", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const checklist = page.getByRole("heading", { level: 2, name: "Get started", exact: true });
  await expect(checklist).toBeFocused();

  // Once per account: not after a reload, and not in another browser.
  await page.reload();
  await expect(checklist).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an instructor in the shared org is never shown the teacher welcome", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, `no-welcome-${testInfo.project.name}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Item banks", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// #365: the welcome a new student sees once, the first time they are on their home in a class.
test("a new student who joins by code is welcomed in three steps, once", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const project = testInfo.project.name;

  // An instructor makes a class and reads out its code.
  const desk = await browser.newContext();
  const teacher = await desk.newPage();
  await signInAsNewAuthor(teacher, request, `student-welcome-${project}`);
  const className = `NUR 350 Fall ${Date.now() % 100_000}`;
  await teacher.getByRole("link", { name: "Classes", exact: true }).click();
  await teacher.getByRole("textbox", { name: "Class name", exact: true }).fill(className);
  await teacher.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(
    teacher.getByRole("heading", { level: 1, name: className, exact: true }),
  ).toBeVisible();
  const code = (await teacher.getByTestId("class-code").innerText()).trim();
  await desk.close();

  // The student signs up with no invite, then types the code.
  await page.goto("/sign-up?role=student");
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill("Kai Ortiz");
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill(uniqueEmail(`student-welcome-${project}`));
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  // No welcome before there is a class to be welcomed to.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Class code", exact: true }).fill(code);
  await page.getByRole("button", { name: "Join the class", exact: true }).click();
  await expect(page).toHaveURL(/\/learn$/);

  const dialog = page.getByRole("dialog");
  const count = dialog.getByRole("status");
  await expect(dialog).toHaveAccessibleName("Welcome, Kai Ortiz");
  await expect(dialog).toContainText(`You are in ${className}.`);
  await expect(count).toHaveText("Step 1 of 3");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `test-results/screenshots/${project}/student-welcome-1.png` });

  await dialog.getByRole("button", { name: "Next", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAccessibleName("Assignments and practice");
  await expect(count).toHaveText("Step 2 of 3");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `test-results/screenshots/${project}/student-welcome-2.png` });

  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAccessibleName("Results and live sessions");
  await expect(count).toHaveText("Step 3 of 3");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `test-results/screenshots/${project}/student-welcome-3.png` });

  await dialog.getByRole("button", { name: "Go to my classes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const heading = page.getByRole("heading", { level: 1, name: "Your classes", exact: true });
  await expect(heading).toBeFocused();
  await expect(page.getByRole("list", { name: "Your classes", exact: true })).toContainText(
    className,
  );

  // Once per account.
  await page.reload();
  await expect(heading).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
