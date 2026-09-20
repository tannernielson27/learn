import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fillMultipleChoice, publishOpenItem } from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

/** Two groups of three from the unambiguous alphabet, exactly as the console shows it. */
const CODE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{3} [23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{3}$/;

test("an instructor starts a session from a bank, sees a six-character code, and ends it", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, a bank, a published item and two session calls: longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);

  const bankName = `Live ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  // A bank with nothing published cannot be run, and says so rather than failing quietly.
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(
    page.getByText("Publish an item in this bank before starting a live session."),
  ).toBeVisible();

  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
  // A new item starts with four blank option fields and every label is required, so filling only
  // two leaves the item invalid on options C and D. publishOpenItem asserts the editor lists no
  // problems, so all four have to be filled.
  await fillMultipleChoice(
    page,
    "Which finding is expected?",
    ["Bradycardia", "Tachycardia", "Hypotension", "Bounding pulses"],
    1,
  );
  await publishOpenItem(page);
  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  const consoleUrl = page.url();

  const code = page.getByTestId("join-code");
  await expect(code).toHaveText(CODE);
  await expect(page.getByRole("region", { name: "Join code" })).toContainText(
    "Students join with this code.",
  );
  // The three Playwright projects are 375, 768 and 1280, so this runs at each breakpoint; the code
  // has to be visible and whole at every one.
  await expect(code).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(page.getByText("This session has ended.")).toBeVisible();
  await expect(page.getByRole("button", { name: "End session", exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page);

  // An ended session cannot be reopened, however the page is reached again.
  await page.goto(consoleUrl);
  await expect(page.getByText("This session has ended.")).toBeVisible();
});
