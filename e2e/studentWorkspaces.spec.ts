import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { formatClassCode } from "../src/lib/classes/classCode";
import { bytesOf, expectKeyless } from "./bytes";
import { insertAsAdmin, selectAsAdmin } from "./signIn";
import { skipWelcomes } from "./welcome";

// The workspace beside a row on the student home (#398, and practice rows since
// 20261011010000_practice_workspace_name.sql). A student in classes of one workspace reads no
// workspace on an open-assignment row, a history row or a practice row; once the same account is
// in a class of a second workspace, each of those rows names its workspace. The class list names
// the workspace either way, which is this test's control. Needs the local Supabase stack; CI runs
// it in the `auth-e2e` job.
//
// An assignment cannot be created already closed, and moving its close into the past is refused
// by the guard trigger, so the history row waits out a short real window, as
// studentHistory.spec.ts does. Nothing is answered here, so the window is short.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// The seeded "Samples" bank (supabase/seed.sql). Its org is the first workspace here.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";
const PASSWORD = "correct horse battery";
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
/** From making the assignment to its close: long enough to insert it and nothing more. */
const WINDOW_MS = 12_000;

interface MadeClass {
  id: string;
  code: string;
}

/**
 * A class written with the local secret key. The columns' defaults call functions only
 * `authenticated` may run, so the token and the code are supplied here in the same shapes.
 */
async function makeClass(
  request: APIRequestContext,
  orgId: string,
  name: string,
): Promise<MadeClass> {
  const code = Array.from(
    randomBytes(8),
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join("");
  const row = await insertAsAdmin<{ id: string }>(request, "classes", {
    org_id: orgId,
    name,
    invite_token: randomBytes(24).toString("base64url"),
    join_code: code,
  });
  return { id: row.id, code: formatClassCode(code) };
}

const classes = (page: Page) => page.getByRole("list", { name: "Your classes", exact: true });
const openList = (page: Page) => page.getByRole("list", { name: "Open assignments", exact: true });
const history = (page: Page) => page.getByRole("list", { name: "Assignment history", exact: true });
const practice = (page: Page) => page.getByRole("list", { name: "Practice banks", exact: true });

test("a student in two workspaces reads the workspace on assignment, history and practice rows, and a student in one reads none", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const project = testInfo.project.name;
  const stamp = `${Date.now() % 1_000_000}`;

  // Two workspaces: the seeded one, which has a bank with published items, and a new one.
  const [samples] = await selectAsAdmin<{ org_id: string }>(
    request,
    "item_banks",
    `id=eq.${SAMPLES_BANK}&select=org_id`,
  );
  if (!samples) throw new Error("the seeded Samples bank is missing");
  const [firstOrg] = await selectAsAdmin<{ name: string }>(
    request,
    "orgs",
    `id=eq.${samples.org_id}&select=name`,
  );
  if (!firstOrg) throw new Error("the seeded org is missing");
  const firstWorkspace = firstOrg.name;
  const secondWorkspace = `Second workspace ${project} ${stamp}`;
  const secondOrg = await insertAsAdmin<{ id: string }>(request, "orgs", {
    name: secondWorkspace,
  });

  // A class in each, and a bank shared with each class for practice.
  const firstClassName = `NUR 398 First ${project} ${stamp}`;
  const secondClassName = `NUR 398 Second ${project} ${stamp}`;
  const firstClass = await makeClass(request, samples.org_id, firstClassName);
  const secondClass = await makeClass(request, secondOrg.id, secondClassName);
  const secondBankName = `Second bank ${project} ${stamp}`;
  const secondBank = await insertAsAdmin<{ id: string }>(request, "item_banks", {
    org_id: secondOrg.id,
    name: secondBankName,
  });
  await insertAsAdmin(request, "bank_practice_shares", {
    org_id: samples.org_id,
    bank_id: SAMPLES_BANK,
    class_id: firstClass.id,
  });
  await insertAsAdmin(request, "bank_practice_shares", {
    org_id: secondOrg.id,
    bank_id: secondBank.id,
    class_id: secondClass.id,
  });

  // The student signs up and joins the first workspace's class by its code.
  await skipWelcomes(page);
  await page.goto("/sign-up");
  await page.getByRole("radio", { name: /^I am a student/ }).check();
  await page.getByRole("textbox", { name: "Your name", exact: true }).fill(`Kai Ortiz ${stamp}`);
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill(`two-workspaces-${project}-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole("textbox", { name: "Class code", exact: true }).fill(firstClass.code);
  await page.getByRole("button", { name: "Join the class", exact: true }).click();
  await expect(page).toHaveURL(/\/learn$/);

  // In the first workspace's class: one assignment open for a day, one that closes in a moment.
  const openTitle = `Week 9 ${project} ${stamp}`;
  const closedTitle = `Week 8 ${project} ${stamp}`;
  const closesAt = Date.now() + WINDOW_MS;
  const assign = (title: string, closes: number) =>
    insertAsAdmin<{ id: string }>(request, "assignments", {
      org_id: samples.org_id,
      class_id: firstClass.id,
      bank_id: SAMPLES_BANK,
      title,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      closes_at: new Date(closes).toISOString(),
      max_attempts: 1,
      shuffle_options: false,
    });
  await assign(openTitle, Date.now() + 86_400_000);
  await assign(closedTitle, closesAt);

  // After the close (and its two seconds of grace).
  await page.waitForTimeout(Math.max(0, closesAt + 3_000 - Date.now()));
  await page.goto("/learn");
  const openRow = openList(page).getByRole("listitem").filter({ hasText: openTitle });
  const historyRow = history(page).getByRole("listitem").filter({ hasText: closedTitle });
  const samplesRow = practice(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: "Samples", exact: true }) });
  await expect(openRow).toHaveCount(1);
  await expect(historyRow).toHaveCount(1);
  await expect(samplesRow).toHaveCount(1);

  // 1. One workspace. Control: its name is on the page, beside the class in the class list.
  await expect(classes(page).getByRole("listitem")).toHaveCount(1);
  await expect(classes(page).getByText(firstWorkspace, { exact: true })).toBeVisible();
  // The rows name the class and no workspace.
  await expect(openRow).toContainText(firstClassName);
  await expect(historyRow.getByText(firstClassName, { exact: true })).toBeVisible();
  await expect(openRow).not.toContainText(`${firstClassName}, `);
  await expect(historyRow).not.toContainText(`${firstClassName}, `);
  await expect(openList(page)).not.toContainText(firstWorkspace);
  await expect(history(page)).not.toContainText(firstWorkspace);
  await expect(practice(page)).not.toContainText(firstWorkspace);
  await expect(practice(page).getByRole("listitem")).toHaveCount(1);

  // 2. The same account joins the second workspace's class.
  await page.getByText("Join another class", { exact: true }).click();
  await page.getByRole("textbox", { name: "Class code", exact: true }).fill(secondClass.code);
  await page.getByRole("button", { name: "Join the class", exact: true }).click();
  await expect(classes(page).getByRole("listitem")).toHaveCount(2);
  await expect(classes(page).getByText(secondWorkspace, { exact: true })).toBeVisible();

  // Now each row says which workspace it is from: beside the class on assignment and history
  // rows, and on its own on a practice row, which names no class.
  const classAndWorkspace = `${firstClassName}, ${firstWorkspace}`;
  await expect(openRow).toContainText(classAndWorkspace);
  await expect(historyRow.getByText(classAndWorkspace, { exact: true })).toBeVisible();
  await expect(practice(page).getByRole("listitem")).toHaveCount(2);
  await expect(samplesRow.getByText(firstWorkspace, { exact: true })).toBeVisible();
  const secondRow = practice(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: secondBankName, exact: true }) });
  await expect(secondRow.getByText(secondWorkspace, { exact: true })).toBeVisible();
  // Each practice row carries its own workspace and not the other's.
  await expect(samplesRow.getByText(secondWorkspace, { exact: true })).toHaveCount(0);
  await expect(secondRow.getByText(firstWorkspace, { exact: true })).toHaveCount(0);

  await page.screenshot({
    path: `test-results/screenshots/${project}/student-two-workspaces.png`,
    fullPage: true,
  });

  // No sideways scroll at this width with the longer rows.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // On the wire: both workspace names, and still no key.
  const bytes = await bytesOf(page.context(), "/learn");
  expect(bytes).toContain(classAndWorkspace);
  expect(bytes).toContain(secondWorkspace);
  expectKeyless(bytes, []);
});
