import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { bytesOf, expectKeyless, KEY_MARKERS, wireText } from "./bytes";

// #367: Sprint 13's demo, run by a machine. A stranger becomes a teacher, makes a class, and a
// second stranger becomes their student, with nobody's help: no account is made beforehand and no
// emailed link is opened. Then a second teacher signs up and is shown to see nothing of the first,
// and the same student joins a class of theirs too: one account, two workspaces.
// docs/sprints/S13-demo.md is the same walk for a person. Needs the local Supabase stack and a
// build pointed at it, like auth.spec.ts. It waits out no real time.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const PASSWORD = "correct horse battery";
/** A class code as the class page shows it: two groups of four from the unambiguous alphabet. */
const CLASS_CODE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

function address(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/** Each step's picture, for the demo doc: test-results/screenshots/<project>/demo13-<step>.png. */
async function shoot(page: Page, testInfo: TestInfo, step: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/demo13-${step}.png`,
    fullPage: true,
  });
}

/** Another person's browser at this project's size. */
async function anotherBrowser(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  const { viewport, isMobile, hasTouch, baseURL } = testInfo.project.use;
  return browser.newContext({ viewport, isMobile, hasTouch, baseURL, reducedMotion: "reduce" });
}

async function signUp(
  page: Page,
  role: "teacher" | "student",
  name: string,
  email: string,
): Promise<void> {
  await page.goto("/sign-up");
  await expect(
    page.getByRole("heading", { level: 1, name: "Create an account", exact: true }),
  ).toBeVisible();
  const choice = role === "teacher" ? /^I teach/ : /^I am a student/;
  await page.getByRole("radio", { name: choice }).check();
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
}

/** Walks a three-step welcome to its last button. */
async function walkWelcome(page: Page, firstTitle: string, finish: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName(firstTitle);
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Step 2 of 3");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Step 3 of 3");
  await dialog.getByRole("button", { name: finish, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** A page's bytes whatever its status: a page that is refused must not carry the marker either. */
async function bytesAnyStatus(context: BrowserContext, path: string): Promise<string> {
  return wireText(await (await context.request.get(path)).text());
}

test("a stranger becomes a teacher, and another stranger becomes their student, with no help", async ({
  browser,
  page,
}, testInfo) => {
  // Three sign-ups, an import and a class across three browsers.
  test.slow();
  const project = testInfo.project.name;
  const stamp = `${Date.now() % 1_000_000}`;
  const teacherName = `Ada Lovelace ${stamp}`;
  const studentName = `Kai Ortiz ${stamp}`;
  // Names nobody else has, so a grep for them can only find this teacher's own rows.
  const bankName = `Registration bank ${stamp}`;
  const className = `NUR 360 Registration ${stamp}`;

  // 1. A teacher signs up and is in at once, in an empty workspace, and is welcomed once.
  await signUp(page, "teacher", teacherName, address(`reg-teacher-${project}`));
  await expect(page).toHaveURL(/\/author$/);
  await shoot(page, testInfo, "1-teacher-welcome");
  await walkWelcome(page, `Welcome, ${teacherName}`, "Get started");
  const checklist = page.getByRole("region", { name: "Get started", exact: true });
  await expect(checklist.getByText("0 of 3 done", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);

  // 2. The sample bank comes in, and a bank of their own is named.
  await checklist.getByRole("button", { name: "Import the sample bank", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sample bank", exact: true }),
  ).toBeVisible();
  const itemPath = await page
    .locator('a[href^="/author/items/"]:not([href$="/play"])')
    .first()
    .getAttribute("href");
  expect(itemPath).toMatch(/^\/author\/items\/[0-9a-f-]{36}/);
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name", exact: true }).fill(bankName);
  await page.getByRole("button", { name: "Create bank", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}$/);
  const bankPath = new URL(page.url()).pathname;

  // 3. A class, and its code read off the page.
  await page.goto("/author/classes");
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(className);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: className, exact: true })).toBeVisible();
  const classPath = new URL(page.url()).pathname;
  const code = (await page.getByTestId("class-code").innerText()).trim();
  expect(code).toMatch(CLASS_CODE);
  await shoot(page, testInfo, "2-class-code");

  // 4. A student signs up with no invite, types the code, and is welcomed once into the class.
  const phone = await anotherBrowser(browser, testInfo);
  const student = await phone.newPage();
  await signUp(student, "student", studentName, address(`reg-student-${project}`));
  await expect(student).toHaveURL(/\/welcome$/);
  await student.getByRole("textbox", { name: "Class code", exact: true }).fill(code);
  await student.getByRole("button", { name: "Join the class", exact: true }).click();
  await expect(student).toHaveURL(/\/learn$/);
  await shoot(student, testInfo, "3-student-welcome");
  await walkWelcome(student, `Welcome, ${studentName}`, "Go to my classes");
  await expect(student.getByRole("list", { name: "Your classes", exact: true })).toContainText(
    className,
  );
  await expectNoAxeViolations(student);
  await shoot(student, testInfo, "4-student-home");

  // 5. The teacher's roster shows the student by name.
  await page.reload();
  await expect(page.getByRole("list", { name: "Roster", exact: true })).toContainText(studentName);
  await shoot(page, testInfo, "5-roster");

  // 6. The student's pages carry no key. Control: the same grep finds a key where one belongs,
  //    on the teacher's own item editor, and finds the class name the student should see.
  const editorBytes = await bytesOf(page.context(), itemPath ?? "");
  expect(KEY_MARKERS.some((marker) => editorBytes.includes(marker))).toBe(true);
  const studentHome = await bytesOf(phone, "/learn");
  expect(studentHome).toContain(className);
  expectKeyless(studentHome, []);
  // The student is not an author: the teacher's bank and item never reach them, key or name.
  for (const path of [bankPath, itemPath ?? "", "/author"]) {
    const bytes = await bytesAnyStatus(phone, path);
    expect(bytes).not.toContain(bankName);
    expectKeyless(bytes, []);
  }

  // 7. A second teacher signs up and sees nothing of the first. Control: the first teacher's own
  //    pages do carry the names being looked for.
  expect(await bytesOf(page.context(), "/author")).toContain(bankName);
  expect(await bytesOf(page.context(), "/author/classes")).toContain(className);
  expect(await bytesOf(page.context(), classPath)).toContain(studentName);

  const desk = await anotherBrowser(browser, testInfo);
  const other = await desk.newPage();
  const otherName = `Grace Hopper ${stamp}`;
  await signUp(other, "teacher", otherName, address(`reg-other-${project}`));
  await expect(other).toHaveURL(/\/author$/);
  await other.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(other.getByRole("dialog")).toHaveCount(0);
  await expect(
    other.getByRole("heading", { level: 2, name: "No item banks yet", exact: true }),
  ).toBeVisible();
  for (const path of ["/author", "/author/classes", bankPath, classPath, itemPath ?? ""]) {
    const bytes = await bytesAnyStatus(desk, path);
    for (const marker of [bankName, className, studentName, teacherName]) {
      expect(bytes, `${path} must not carry "${marker}"`).not.toContain(marker);
    }
  }

  // 8. The second teacher makes a class of their own, and the same student joins it with the same
  //    account by typing its code (owner decision 2026-10-08). Their home lists both classes, each
  //    with its teacher's workspace.
  const otherClassName = `NUR 370 Second ${stamp}`;
  await other.goto("/author/classes");
  await other.getByRole("textbox", { name: "Class name", exact: true }).fill(otherClassName);
  await other.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(
    other.getByRole("heading", { level: 1, name: otherClassName, exact: true }),
  ).toBeVisible();
  const otherClassPath = new URL(other.url()).pathname;
  const otherCode = (await other.getByTestId("class-code").innerText()).trim();
  expect(otherCode).toMatch(CLASS_CODE);

  await student.goto("/learn");
  await student.getByText("Join another class", { exact: true }).click();
  await student.getByRole("textbox", { name: "Class code", exact: true }).fill(otherCode);
  await student.getByRole("button", { name: "Join the class", exact: true }).click();
  const joined = student
    .getByRole("list", { name: "Your classes", exact: true })
    .getByRole("listitem");
  await expect(joined).toHaveCount(2);
  await expect(joined.filter({ hasText: className })).toContainText(`${teacherName}’s workspace`);
  await expect(joined.filter({ hasText: otherClassName })).toContainText(
    `${otherName}’s workspace`,
  );
  await expectNoAxeViolations(student);
  await shoot(student, testInfo, "6-two-workspaces");

  // Each teacher has the student on their own roster and still nothing of the other's workspace.
  await other.reload();
  await expect(other.getByRole("list", { name: "Roster", exact: true })).toContainText(studentName);
  for (const path of ["/author", "/author/classes", otherClassPath, bankPath, classPath]) {
    const bytes = await bytesAnyStatus(desk, path);
    for (const marker of [bankName, className, teacherName]) {
      expect(bytes, `${path} must not carry "${marker}"`).not.toContain(marker);
    }
  }
  for (const path of ["/author", "/author/classes", classPath, otherClassPath]) {
    const bytes = await bytesAnyStatus(page.context(), path);
    for (const marker of [otherClassName, otherName]) {
      expect(bytes, `${path} must not carry "${marker}"`).not.toContain(marker);
    }
  }

  await phone.close();
  await desk.close();
});
