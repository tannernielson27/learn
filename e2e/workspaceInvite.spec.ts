import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { wireText } from "./bytes";
import { confirmLinkIn, latestEmail, openSignInLink } from "./mailbox";
import { skipWelcomes } from "./welcome";

// A teacher invites a colleague into their own workspace (owner decisions 2026-10-08, ADR 0010):
// /author/workspace on the teacher's side, the emailed /w/<token> link on the colleague's. Every
// account here is made the way a person makes one, on /sign-up or on the invitation itself, and
// every invitation is read out of the test mailbox. Needs the local Supabase stack and a build
// pointed at it, like auth.spec.ts. It waits out no real time.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const PASSWORD = "correct horse battery";
const INVITE_SUBJECT = "You are invited to teach in a LeaRN workspace";
const INVITE_HEADING_CLOSED = "This invitation can no longer be used";
const INVITE_HEADING_REFUSED = "This account cannot accept the invitation";
/** A class code as the class page shows it: two groups of four from the unambiguous alphabet. */
const CLASS_CODE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

function address(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/** Nothing on the page is wider than the page: no sideways scroll at this project's width. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shoot(page: Page, testInfo: TestInfo, step: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/workspace-invite-${step}.png`,
    fullPage: true,
  });
}

/** Another person's browser at this project's size, signed in to nothing. */
async function anotherBrowser(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  const { viewport, isMobile, hasTouch, baseURL } = testInfo.project.use;
  return browser.newContext({ viewport, isMobile, hasTouch, baseURL, reducedMotion: "reduce" });
}

async function signUp(
  page: Page,
  role: "teacher" | "student",
  name: string,
  email: string,
  password: string = PASSWORD,
): Promise<void> {
  await page.goto("/sign-up");
  await expect(
    page.getByRole("heading", { level: 1, name: "Create an account", exact: true }),
  ).toBeVisible();
  const choice = role === "teacher" ? /^I teach/ : /^I am a student/;
  await page.getByRole("radio", { name: choice }).check();
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
}

/**
 * A teacher who signed up and then opened the welcome email in the same browser. Only a confirmed
 * teacher may invite: `create_org_invite` answers `unconfirmed` for anyone else.
 */
async function signUpConfirmedTeacher(
  page: Page,
  request: APIRequestContext,
  name: string,
  email: string,
): Promise<void> {
  const since = new Date();
  await signUp(page, "teacher", name, email);
  await expect(page).toHaveURL(/\/author$/);
  const welcome = await latestEmail(request, email, since);
  await openSignInLink(page, confirmLinkIn(welcome.body, email));
  await expect(page).toHaveURL(/\/author$/);
}

/** An account with no role: on /sign-up, "I am a student" makes one until a class is joined. */
async function signUpWithNoRole(
  page: Page,
  name: string,
  email: string,
  password: string = PASSWORD,
): Promise<void> {
  await signUp(page, "student", name, email, password);
  await expect(page).toHaveURL(/\/welcome$/);
}

async function openWorkspace(page: Page, teacherName: string): Promise<void> {
  await page.goto("/author/workspace");
  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(`^${teacherName}.s workspace$`) }),
  ).toBeVisible();
}

const members = (page: Page) => page.getByRole("list", { name: "Members", exact: true });
const pending = (page: Page) =>
  page.getByRole("list", { name: "Pending invitations", exact: true });

/**
 * Invites `email` from the workspace page, sees it listed under Pending, and returns the path of
 * the link in the email, `/w/<token>`. The token is read from the mailbox and nowhere else: the
 * page never shows it.
 */
async function invite(page: Page, request: APIRequestContext, email: string): Promise<string> {
  const since = new Date();
  await page.getByRole("textbox", { name: "Colleague's email address", exact: true }).fill(email);
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `Invitation sent to ${email}.` }),
  ).toBeVisible();
  await expect(pending(page)).toContainText(email);

  const mail = await latestEmail(request, email, since, INVITE_SUBJECT);
  const link = mail.body.match(/https?:\/\/[^\s"'<>]+\/w\/[A-Za-z0-9_-]{16,}/)?.[0];
  expect(link, `the invitation for ${email} has no /w/ link`).toBeTruthy();
  expect(mail.text).toContain(link!);
  const path = new URL(link!).pathname;
  // The page that sent it never carried the token.
  expect(wireText(await page.content())).not.toContain(path.slice("/w/".length));
  return path;
}

/** "X invited you to teach in X's workspace", as the invitation page heads itself. */
function invitationHeading(page: Page, inviterName: string) {
  return page.getByRole("heading", {
    level: 1,
    name: new RegExp(`^${inviterName} invited you to teach in ${inviterName}.s workspace$`),
  });
}

/** A page's bytes whatever its status: a page that is refused must not carry the marker either. */
async function bytesAnyStatus(context: BrowserContext, path: string): Promise<string> {
  return wireText(await (await context.request.get(path)).text());
}

async function createBank(page: Page, name: string): Promise<string> {
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create bank", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

test("a teacher invites a colleague, who makes an account from the email and shares the workspace", async ({
  browser,
  page,
  request,
}, testInfo) => {
  // Three people, two emails and an account made on the invitation, across three browsers.
  test.slow();
  const project = testInfo.project.name;
  const stamp = `${Date.now() % 1_000_000}`;
  const teacherName = `Ada Lovelace ${stamp}`;
  const colleagueName = `Mary Seacole ${stamp}`;
  const bankName = `Shared bank ${stamp}`;
  const colleagueEmail = address(`ws-colleague-${project}`);

  // 1. A self-registered teacher, confirmed, with a bank of their own, opens their workspace.
  await skipWelcomes(page);
  await signUpConfirmedTeacher(page, request, teacherName, address(`ws-teacher-${project}`));
  const bankPath = await createBank(page, bankName);
  await page.goto("/author");
  await page
    .getByRole("navigation", { name: "More", exact: true })
    .getByRole("link", { name: "Workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/author\/workspace$/);
  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(`^${teacherName}.s workspace$`) }),
  ).toBeVisible();
  await expect(members(page).getByRole("listitem")).toHaveCount(1);
  await expect(members(page)).toContainText(`${teacherName} (you)`);
  await expect(page.getByText("1 of 10 members", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "No pending invitations", exact: true }),
  ).toBeVisible();

  // 2. They invite an address nobody has an account on, and it is listed under Pending.
  const invitePath = await invite(page, request, colleagueEmail);
  await expect(pending(page).getByRole("listitem")).toHaveCount(1);
  await expectNoAxeViolations(page);
  await expectNoSidewaysScroll(page);
  await shoot(page, testInfo, "1-pending");

  // 3. The colleague opens the link. Opening it accepts nothing and makes nothing.
  const laptop = await anotherBrowser(browser, testInfo);
  const colleague = await laptop.newPage();
  const opened = await colleague.goto(invitePath);
  expect(opened?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(invitationHeading(colleague, teacherName)).toBeVisible();
  await expect(colleague.getByRole("textbox", { name: "Email address", exact: true })).toHaveValue(
    colleagueEmail,
  );
  await expectNoAxeViolations(colleague);
  await expectNoSidewaysScroll(colleague);
  await shoot(colleague, testInfo, "2-invitation");
  // The way in for someone who has an account carries the token too, and sends no Referer either.
  const signInHref = await colleague
    .getByRole("link", { name: "Sign in to accept", exact: true })
    .getAttribute("href");
  expect(signInHref).toBe(`/sign-in?next=${encodeURIComponent(invitePath)}`);
  const signInPage = await laptop.request.get(signInHref!);
  expect(signInPage.headers()["referrer-policy"]).toBe("no-referrer");
  // Control: sign-in on its own keeps the browser's default.
  expect((await laptop.request.get("/sign-in")).headers()["referrer-policy"]).toBeUndefined();

  await page.reload();
  await expect(pending(page)).toContainText(colleagueEmail);
  await expect(page.getByText("1 of 10 members", { exact: true })).toBeVisible();

  // 4. A name and a password, and they are in: on the teacher's item banks, seeing the bank.
  await colleague.getByRole("textbox", { name: "Your name", exact: true }).fill(colleagueName);
  await colleague.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await colleague.getByRole("button", { name: "Create account and join", exact: true }).click();
  await expect(colleague).toHaveURL(/\/author$/);
  // The welcome is the short one for someone who joined a workspace that is not theirs alone.
  const welcome = colleague.getByRole("dialog");
  await expect(welcome).toHaveAccessibleName(`Welcome, ${colleagueName}`);
  await expect(welcome).toContainText("You have joined a shared workspace.");
  await shoot(colleague, testInfo, "3-colleague-welcome");
  await welcome.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(colleague.getByRole("dialog")).toHaveCount(0);
  await expect(colleague.getByRole("link", { name: bankName }).first()).toBeVisible();
  // An accepted invitation is the proof the address is theirs: nobody asks them to confirm it.
  await expect(
    colleague.getByRole("heading", { name: "Confirm your email address", exact: true }),
  ).toHaveCount(0);
  // The teacher's bank opens for them as it does for the teacher.
  await colleague.goto(bankPath);
  await expect(
    colleague.getByRole("heading", { level: 1, name: bankName, exact: true }),
  ).toBeVisible();

  // 5. Both are members, on both people's pages, and nothing is pending.
  await page.reload();
  await expect(members(page).getByRole("listitem")).toHaveCount(2);
  await expect(members(page)).toContainText(`${teacherName} (you)`);
  await expect(members(page)).toContainText(colleagueName);
  await expect(members(page)).toContainText(colleagueEmail);
  await expect(page.getByText("2 of 10 members", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "No pending invitations", exact: true }),
  ).toBeVisible();
  await shoot(page, testInfo, "4-members");

  await openWorkspace(colleague, teacherName);
  await expect(members(colleague).getByRole("listitem")).toHaveCount(2);
  await expect(members(colleague)).toContainText(`${colleagueName} (you)`);
  await expect(members(colleague)).toContainText(teacherName);
  // Any teacher of the workspace may invite, the colleague included.
  await expect(
    colleague.getByRole("textbox", { name: "Colleague's email address", exact: true }),
  ).toBeVisible();

  // 6. The link has been used: it says so, and offers nobody a form.
  const visitor = await anotherBrowser(browser, testInfo);
  const stranger = await visitor.newPage();
  await stranger.goto(invitePath);
  await expect(
    stranger.getByRole("heading", { level: 1, name: INVITE_HEADING_CLOSED, exact: true }),
  ).toBeVisible();
  await expect(stranger.getByText("This invitation has already been used.")).toBeVisible();
  await expect(
    stranger.getByRole("button", { name: "Create account and join", exact: true }),
  ).toHaveCount(0);
  await expect(stranger.getByRole("button", { name: "Join workspace", exact: true })).toHaveCount(
    0,
  );

  // 7. A third teacher, with a workspace of their own, sees nothing of this one. Control: the
  //    inviting teacher's own pages do carry the names being looked for.
  const ownWorkspace = await bytesAnyStatus(page.context(), "/author/workspace");
  expect(ownWorkspace).toContain(colleagueName);
  expect(ownWorkspace).toContain(colleagueEmail);
  expect(await bytesAnyStatus(page.context(), "/author")).toContain(bankName);

  const desk = await anotherBrowser(browser, testInfo);
  const other = await desk.newPage();
  await skipWelcomes(other);
  const otherName = `Grace Hopper ${stamp}`;
  await signUp(other, "teacher", otherName, address(`ws-other-${project}`));
  await expect(other).toHaveURL(/\/author$/);
  await openWorkspace(other, otherName);
  await expect(members(other).getByRole("listitem")).toHaveCount(1);
  await expect(other.getByText("1 of 10 members", { exact: true })).toBeVisible();
  for (const path of ["/author", "/author/workspace", "/author/classes", bankPath]) {
    const bytes = await bytesAnyStatus(desk, path);
    for (const marker of [bankName, teacherName, colleagueName, colleagueEmail]) {
      expect(bytes, `${path} must not carry "${marker}"`).not.toContain(marker);
    }
  }

  await laptop.close();
  await visitor.close();
  await desk.close();
});

test("a student and a teacher are refused, and a revoked invitation stops working", async ({
  browser,
  page,
  request,
}, testInfo) => {
  // Three sign-ups, a class, two invitations and a revoke, across four browsers.
  test.slow();
  const project = testInfo.project.name;
  const stamp = `${Date.now() % 1_000_000}`;
  const teacherName = `Ada Lovelace ${stamp}`;
  const className = `NUR 410 Invite ${stamp}`;
  const studentEmail = address(`ws-student-${project}`);
  const otherTeacherEmail = address(`ws-teaches-${project}`);

  // The inviting teacher, and a class for the student to be a student of.
  await skipWelcomes(page);
  await signUpConfirmedTeacher(page, request, teacherName, address(`ws-refuser-${project}`));
  await page.goto("/author/classes");
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(className);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: className, exact: true })).toBeVisible();
  const code = (await page.getByTestId("class-code").innerText()).trim();
  expect(code).toMatch(CLASS_CODE);

  // A student: signed up, then in the class by its code.
  const phone = await anotherBrowser(browser, testInfo);
  const student = await phone.newPage();
  await skipWelcomes(student);
  await signUpWithNoRole(student, `Kai Ortiz ${stamp}`, studentEmail);
  await student.getByRole("textbox", { name: "Class code", exact: true }).fill(code);
  await student.getByRole("button", { name: "Join the class", exact: true }).click();
  await expect(student).toHaveURL(/\/learn$/);

  // A teacher with a workspace of their own already.
  const desk = await anotherBrowser(browser, testInfo);
  const otherTeacher = await desk.newPage();
  await skipWelcomes(otherTeacher);
  await signUp(otherTeacher, "teacher", `Grace Hopper ${stamp}`, otherTeacherEmail);
  await expect(otherTeacher).toHaveURL(/\/author$/);

  // Both addresses are invited; the invitations are made, since the form cannot know who they are.
  await openWorkspace(page, teacherName);
  const studentPath = await invite(page, request, studentEmail);
  const teacherPath = await invite(page, request, otherTeacherEmail);
  await expect(pending(page).getByRole("listitem")).toHaveCount(2);

  // 1. The student is told why, and is offered no way to accept.
  await student.goto(studentPath);
  await expect(
    student.getByRole("heading", { level: 1, name: INVITE_HEADING_REFUSED, exact: true }),
  ).toBeVisible();
  await expect(
    student.getByText("This address is a student account, and a student account cannot become"),
  ).toBeVisible();
  await expect(student.getByRole("button", { name: "Join workspace", exact: true })).toHaveCount(0);
  await expectNoAxeViolations(student);
  await shoot(student, testInfo, "5-student-refused");
  // Still a student, and still not an author.
  await student.goto("/author/workspace");
  await expect(student).toHaveURL(/\/learn$/);

  // 2. So is the teacher, with their own sentence.
  await otherTeacher.goto(teacherPath);
  await expect(
    otherTeacher.getByRole("heading", { level: 1, name: INVITE_HEADING_REFUSED, exact: true }),
  ).toBeVisible();
  await expect(
    otherTeacher.getByText("This account already teaches in a workspace."),
  ).toBeVisible();
  await expect(
    otherTeacher.getByRole("button", { name: "Join workspace", exact: true }),
  ).toHaveCount(0);

  // 3. Someone else's invitation, opened while signed in: told to sign out, and the address it was
  //    sent to is shown only in part.
  await otherTeacher.goto(studentPath);
  await expect(
    otherTeacher.getByRole("heading", {
      level: 1,
      name: "This invitation is for another address",
      exact: true,
    }),
  ).toBeVisible();
  await expect(otherTeacher.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  expect(wireText(await otherTeacher.content())).not.toContain(studentEmail);

  // Nobody joined: one member, two invitations still pending.
  await page.reload();
  await expect(members(page).getByRole("listitem")).toHaveCount(1);
  await expect(pending(page).getByRole("listitem")).toHaveCount(2);

  // 4. Revoke one. It leaves the list, and its link stops working for the invited account and
  //    for a visitor alike.
  await page
    .getByRole("button", { name: `Revoke the invitation to ${otherTeacherEmail}`, exact: true })
    .click();
  await expect(page.getByText("The link in their email stops working.")).toBeVisible();
  await page.getByRole("button", { name: "Revoke invitation", exact: true }).click();
  await expect(pending(page).getByRole("listitem")).toHaveCount(1);
  await expect(pending(page)).not.toContainText(otherTeacherEmail);
  await expect(pending(page)).toContainText(studentEmail);

  await otherTeacher.goto(teacherPath);
  await expect(
    otherTeacher.getByRole("heading", { level: 1, name: INVITE_HEADING_CLOSED, exact: true }),
  ).toBeVisible();
  await expect(
    otherTeacher.getByText("This invitation was withdrawn by the person who sent it."),
  ).toBeVisible();

  const visitor = await anotherBrowser(browser, testInfo);
  const stranger = await visitor.newPage();
  await stranger.goto(teacherPath);
  await expect(
    stranger.getByRole("heading", { level: 1, name: INVITE_HEADING_CLOSED, exact: true }),
  ).toBeVisible();
  await expect(
    stranger.getByRole("button", { name: "Create account and join", exact: true }),
  ).toHaveCount(0);
  await shoot(stranger, testInfo, "6-revoked");

  // 5. A link nobody was sent says one thing, and not which kind of wrong it is.
  await stranger.goto(`/w/${"x".repeat(32)}`);
  await expect(
    stranger.getByRole("heading", {
      level: 1,
      name: "This invitation is not valid or has expired",
      exact: true,
    }),
  ).toBeVisible();

  await phone.close();
  await desk.close();
  await visitor.close();
});

test("an account with no role joins with one button, and one someone else may have made gets a new password", async ({
  browser,
  page,
  request,
}, testInfo) => {
  // Three sign-ups, two invitations and a password change, across four browsers.
  test.slow();
  const project = testInfo.project.name;
  const stamp = `${Date.now() % 1_000_000}`;
  const teacherName = `Ada Lovelace ${stamp}`;
  const bankName = `Shared bank ${stamp}`;
  const ownName = `Mary Seacole ${stamp}`;
  const ownEmail = address(`ws-own-${project}`);
  const takenName = `Edith Cavell ${stamp}`;
  const takenEmail = address(`ws-taken-${project}`);
  const madeWith = "a password someone else chose";

  // Two accounts with no role, both made before any invitation exists.
  // The first is plainly its owner's: they opened the welcome email in the browser they use.
  const laptop = await anotherBrowser(browser, testInfo);
  const own = await laptop.newPage();
  await skipWelcomes(own);
  const ownSince = new Date();
  await signUpWithNoRole(own, ownName, ownEmail);
  const ownWelcome = await latestEmail(request, ownEmail, ownSince);
  await openSignInLink(own, confirmLinkIn(ownWelcome.body, ownEmail));
  // Confirming here ends nothing: it is the browser the account was made in.
  await expect(own).not.toHaveURL(/\/account\/password/);

  // The second was made by sign-up on an address nobody has shown is theirs: the squatter's case.
  const elsewhere = await anotherBrowser(browser, testInfo);
  const taken = await elsewhere.newPage();
  await skipWelcomes(taken);
  await signUpWithNoRole(taken, takenName, takenEmail, madeWith);

  // The teacher, a bank, and an invitation to each address.
  await skipWelcomes(page);
  await signUpConfirmedTeacher(page, request, teacherName, address(`ws-host-${project}`));
  await createBank(page, bankName);
  await openWorkspace(page, teacherName);
  const ownPath = await invite(page, request, ownEmail);
  const takenPath = await invite(page, request, takenEmail);

  // 1. Signed in as the invited address, with no role: one button, and they are a teacher here.
  //    Their address was confirmed and this browser was theirs before the invitation existed, so
  //    nothing of theirs is ended and nobody asks for a new password.
  await own.goto(ownPath);
  await expect(invitationHeading(own, teacherName)).toBeVisible();
  await expect(own.getByText(`You are signed in as ${ownEmail}.`)).toBeVisible();
  await expectNoAxeViolations(own);
  await shoot(own, testInfo, "7-join");
  await own.getByRole("button", { name: "Join workspace", exact: true }).click();
  await expect(own).toHaveURL(/\/author$/);
  await expect(own.getByRole("link", { name: bankName }).first()).toBeVisible();

  // 2. The account made by sign-up accepts with the same button, and is sent to choose a password
  //    of its own before anything else.
  await taken.goto(takenPath);
  await expect(invitationHeading(taken, teacherName)).toBeVisible();
  await taken.getByRole("button", { name: "Join workspace", exact: true }).click();
  await expect(taken).toHaveURL(/\/account\/password\?next=%2Fauthor&confirmed=1$/);
  await expect(
    taken.getByRole("heading", { level: 1, name: "Your email is confirmed", exact: true }),
  ).toBeVisible();
  await expect(taken.getByRole("link", { name: "Not now", exact: true })).toHaveCount(0);

  // The password the account was made with no longer signs anyone in.
  const visitor = await anotherBrowser(browser, testInfo);
  const stranger = await visitor.newPage();
  await skipWelcomes(stranger);
  await stranger.goto("/sign-in");
  await stranger.getByRole("textbox", { name: "Email address", exact: true }).fill(takenEmail);
  await stranger.getByLabel("Password", { exact: true }).fill(madeWith);
  await stranger.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    stranger.getByRole("alert").filter({ hasText: "That email and password do not match." }),
  ).toBeVisible();

  // The accepting browser is still signed in, chooses a password, and is a teacher here.
  const chosen = "a password of my own";
  await taken.getByLabel("New password", { exact: true }).fill(chosen);
  await taken.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(taken.getByRole("heading", { name: "Password saved", exact: true })).toBeVisible();
  await taken.getByRole("link", { name: "Continue", exact: true }).click();
  await expect(taken).toHaveURL(/\/author$/);
  await expect(taken.getByRole("link", { name: bankName }).first()).toBeVisible();
  // And the new password is the one that signs in.
  await stranger.getByLabel("Password", { exact: true }).fill(chosen);
  await stranger.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(stranger).toHaveURL(/\/author$/);

  // 3. The teacher's page lists all three, and nothing is pending.
  await page.reload();
  await expect(members(page).getByRole("listitem")).toHaveCount(3);
  await expect(members(page)).toContainText(ownName);
  await expect(members(page)).toContainText(takenName);
  await expect(page.getByText("3 of 10 members", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "No pending invitations", exact: true }),
  ).toBeVisible();

  await laptop.close();
  await elsewhere.close();
  await visitor.close();
});

/** Revokes the pending invitation to `email` from the workspace page, through its confirmation. */
async function revoke(page: Page, email: string): Promise<void> {
  await page
    .getByRole("button", { name: `Revoke the invitation to ${email}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Revoke invitation", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Revoke the invitation to ${email}`, exact: true }),
  ).toHaveCount(0);
}

test("an address is refused its fourth invitation in a day, whichever workspace asks", async ({
  browser,
  page,
  request,
}, testInfo) => {
  // Two sign-ups, each with its welcome email opened, and three invitations read from the mailbox.
  test.slow();
  const project = testInfo.project.name;
  const stamp = `${Date.now() % 1_000_000}`;
  const firstName = `Ada Lovelace ${stamp}`;
  const secondName = `Grace Hopper ${stamp}`;
  const invited = address(`ws-often-${project}`);
  const refusal =
    "This address has been invited too many times in the last 24 hours. Try again tomorrow.";

  // 1. The first workspace invites the address, revokes, and invites again: two sent, one pending.
  //    A revoked invitation still counts toward what the address was sent.
  await skipWelcomes(page);
  await signUpConfirmedTeacher(page, request, firstName, address(`ws-first-${project}`));
  await openWorkspace(page, firstName);
  await invite(page, request, invited);
  await revoke(page, invited);
  await invite(page, request, invited);
  await expect(pending(page).getByRole("listitem")).toHaveCount(1);

  // 2. A second workspace, which has invited nobody, sends the third.
  const desk = await anotherBrowser(browser, testInfo);
  const second = await desk.newPage();
  await skipWelcomes(second);
  await signUpConfirmedTeacher(second, request, secondName, address(`ws-second-${project}`));
  await openWorkspace(second, secondName);
  await invite(second, request, invited);
  await revoke(second, invited);
  await expect(
    second.getByRole("heading", { level: 3, name: "No pending invitations", exact: true }),
  ).toBeVisible();

  // 3. Its second invitation would be the address's fourth, and is refused: this teacher has sent
  //    one, far inside their own five a day, so it is the address's count that refuses.
  await second
    .getByRole("textbox", { name: "Colleague's email address", exact: true })
    .fill(invited);
  await second.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(second.getByRole("alert").filter({ hasText: refusal })).toHaveText(refusal);
  await expect(second.getByRole("status").filter({ hasText: "Invitation sent to" })).toHaveCount(0);
  await expectNoAxeViolations(second);
  await shoot(second, testInfo, "8-recipient-limited");

  // Nothing was made: nothing is pending there, after a reload too.
  await second.reload();
  await expect(
    second.getByRole("heading", { level: 3, name: "No pending invitations", exact: true }),
  ).toBeVisible();

  // Another address is not refused: the count is the address's, not the workspace's.
  await invite(second, request, address(`ws-fresh-${project}`));

  // The first workspace's invitation is untouched.
  await page.reload();
  await expect(pending(page).getByRole("listitem")).toHaveCount(1);
  await expect(pending(page)).toContainText(invited);

  await desk.close();
});
