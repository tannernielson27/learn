import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { issuePass, listPasses, revokePasses } from "../scripts/beta-pass/commands.mjs";
import { skipWelcomes } from "./welcome";

// A beta pass (#520, ADR 0016): the owner issues a link with scripts/beta-pass.mjs, the tester it
// was sent to opens /b/<token>, makes a teacher account there and accepts, and their workspace
// gets free access until the owner revokes it. Passes are issued with the script's own code and
// the local stack's secret key, as the owner would. Needs the local Supabase stack and a build
// pointed at it, like workspaceInvite.spec.ts.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const PASSWORD = "correct horse battery";
const HEADING = "Free access for your workspace";
const UNUSABLE = "This link cannot be used";

function address(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function issue(testInfo: TestInfo, email: string): Promise<string> {
  const origin = new URL(testInfo.project.use.baseURL ?? "http://localhost:3100").origin;
  const issued = await issuePass(service(), {
    email,
    note: `e2e ${testInfo.project.name}`,
    origin,
  });
  expect(issued.status).toBe("issued");
  return new URL(issued.link!).pathname;
}

async function passFor(email: string) {
  const rows = await listPasses(service());
  return rows.find((row: { email: string }) => row.email === email);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shoot(page: Page, testInfo: TestInfo, step: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/beta-pass-${step}.png`,
    fullPage: true,
  });
}

async function signUp(page: Page, role: "teacher" | "student", name: string, email: string) {
  await page.goto("/sign-up");
  await page
    .getByRole("radio", { name: role === "teacher" ? /^I teach/ : /^I am a student/ })
    .check();
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
}

test("a tester opens their pass signed out, makes a teacher account there, and accepts once", async ({
  page,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;
  const email = address(`bp-tester-${project}`);
  const path = await issue(testInfo, email);

  // 1. Signed out: two ways on, nothing about the pass, no Referer, not indexed.
  await skipWelcomes(page);
  const opened = await page.goto(path);
  expect(opened?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { level: 1, name: HEADING, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await expectNoSidewaysScroll(page);
  await shoot(page, testInfo, "1-signed-out");

  // 2. Making a teacher account there comes back to the pass, signed in.
  await page.getByRole("link", { name: "Create a teacher account", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up\?role=teacher&next=/);
  await expect(page.getByRole("radio", { name: /^I teach/ })).toBeChecked();
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill(`Fay ${project}`);
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));

  // 3. One line and one button.
  await expect(page.getByRole("heading", { level: 1, name: HEADING, exact: true })).toBeVisible();
  await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoSidewaysScroll(page);
  await shoot(page, testInfo, "2-accept");
  expect((await passFor(email))?.state).toBe("pending");

  // 4. Accepting goes straight to authoring, and the workspace has a beta grant with no end.
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page).toHaveURL(/\/author$/);
  const redeemed = await passFor(email);
  expect(redeemed).toMatchObject({ state: "redeemed", grant_active: true });
  const { data: grants } = await service()
    .from("access_grants")
    .select("kind, expires_at, revoked_at")
    .eq("org_id", redeemed!.redeemed_org);
  expect(grants).toEqual([{ kind: "beta", expires_at: null, revoked_at: null }]);

  // 5. A second press, even by the same teacher, is the one neutral sentence.
  await page.goto(path);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: UNUSABLE, exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await shoot(page, testInfo, "3-unusable");

  // 6. Revoking ends the grant too.
  expect(await revokePasses(service(), email)).toEqual({ passes: 1, grants: 1 });
  expect(await passFor(email)).toMatchObject({ state: "revoked", grant_active: false });
});

test("another teacher and someone who does not teach get the same neutral sentence", async ({
  browser,
  page,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;
  const email = address(`bp-bound-${project}`);
  const path = await issue(testInfo, email);

  // A teacher signed in as another address sees the button, and pressing it says only that.
  await skipWelcomes(page);
  await signUp(page, "teacher", `Tom ${project}`, address(`bp-other-${project}`));
  await expect(page).toHaveURL(/\/author$/);
  await page.goto(path);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: UNUSABLE, exact: true })).toBeVisible();

  // An account that does not teach is told the same, with nothing to press.
  const { viewport, isMobile, hasTouch, baseURL } = testInfo.project.use;
  const other = await browser.newContext({ viewport, isMobile, hasTouch, baseURL });
  const learner = await other.newPage();
  await skipWelcomes(learner);
  await signUp(learner, "student", `Sue ${project}`, address(`bp-student-${project}`));
  await expect(learner).toHaveURL(/\/welcome$/);
  await learner.goto(path);
  await expect(
    learner.getByRole("heading", { level: 1, name: UNUSABLE, exact: true }),
  ).toBeVisible();
  await expect(learner.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await expectNoAxeViolations(learner);
  await shoot(learner, testInfo, "4-not-a-teacher");
  await other.close();

  // Neither touched the pass.
  expect((await passFor(email))?.state).toBe("pending");
  await revokePasses(service(), email);
});
