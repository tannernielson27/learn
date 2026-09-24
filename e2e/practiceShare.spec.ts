import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fillMultipleChoice, publishOpenItem } from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// #240: an instructor shares a bank with a class for practice, sees the badge, is warned (not
// stopped) when assigning it, and stops sharing from the class page, after which the badge goes.
// Needs the local Supabase stack; CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

async function addPublishedItem(page: Page, bankName: string, stem: string): Promise<void> {
  await page.getByRole("link", { name: "New item", exact: true }).click();
  await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
  await fillMultipleChoice(page, stem, ["Bradycardia", "Tachycardia", "Hypotension", "Edema"], 1);
  await publishOpenItem(page);
  await page.getByRole("link", { name: "Back to bank", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName, exact: true })).toBeVisible();
}

test("share a bank for practice, be warned on assigning it, and stop sharing", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;
  const shots = `test-results/screenshots/${project}`;
  await signInAsNewAuthor(page, request, `share-${project}`);

  const className = `NUR 310 ${Date.now() % 100_000}`;
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(className);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: className, exact: true })).toBeVisible();

  await page.goto("/author");
  const bankName = `Cardiac week ${project} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Bank name", exact: true }).fill(bankName);
  await page.getByRole("button", { name: "Create bank", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName, exact: true })).toBeVisible();
  await addPublishedItem(page, bankName, "Which finding is expected in heart failure?");
  await addPublishedItem(page, bankName, "Which finding needs follow-up first?");
  const bankUrl = page.url();

  // Share from the bank page.
  const practice = page.getByRole("region", { name: "Practice", exact: true });
  await expect(practice.getByText("Not shared with any class.", { exact: true })).toBeVisible();
  await practice
    .getByRole("combobox", { name: "Class", exact: true })
    .selectOption({ label: className });
  await practice.getByRole("button", { name: "Share for practice", exact: true }).click();
  const badge = `Shared for practice with ${className}`;
  await expect(page.getByText(badge, { exact: true })).toBeVisible();
  await expect(
    practice.getByRole("list", { name: "Shared for practice", exact: true }),
  ).toContainText(className);
  await expect(
    practice.getByRole("button", { name: `Stop sharing with ${className}`, exact: true }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await practice.screenshot({ path: `${shots}/practice-share-bank.png` });

  // The bank list carries the badge.
  await page.goto("/author");
  const bankLink = page
    .getByRole("list", { name: "Item banks", exact: true })
    .getByRole("link")
    .filter({ hasText: bankName });
  await expect(bankLink.getByText(badge, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${shots}/practice-bank-list.png`, fullPage: true });

  // Assigning it warns, names the class and counts the items, and still assigns.
  await page.goto(bankUrl);
  await page.getByRole("link", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}\/assign$/);
  await expect(page.getByRole("note")).toHaveText(
    `Students in ${className} can see the answers to 2 of these items in practice.`,
  );
  await page
    .getByRole("combobox", { name: "Class", exact: true })
    .selectOption({ label: className });
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `${shots}/practice-assign-warning.png`, fullPage: true });
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("list", { name: "Assignments", exact: true }).getByRole("listitem"),
  ).toContainText(bankName);

  // Stop sharing from the class page, by keyboard; the confirmation says seen answers stay seen.
  const classPractice = page.getByRole("region", { name: "Practice", exact: true });
  await expect(
    classPractice.getByRole("list", { name: "Banks shared for practice", exact: true }),
  ).toContainText(bankName);
  const stop = classPractice.getByRole("button", {
    name: `Stop sharing ${bankName}`,
    exact: true,
  });
  await stop.focus();
  await page.keyboard.press("Enter");
  await expect(
    classPractice.getByText(
      `Students in ${className} lose ${bankName} from practice at once. Answers they have already seen stay seen.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(classPractice.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await expectNoAxeViolations(page);
  await classPractice.screenshot({ path: `${shots}/practice-stop-confirm.png` });
  await classPractice.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await expect(
    classPractice.getByText("No bank is shared with this class for practice.", { exact: true }),
  ).toBeVisible();

  // The badge goes from the bank list and the bank page, and assigning no longer warns.
  await page.goto("/author");
  await expect(bankLink).toBeVisible();
  await expect(bankLink.getByText(badge, { exact: true })).toHaveCount(0);
  await page.goto(bankUrl);
  await expect(page.getByText(badge, { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Assign", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName, exact: true })).toBeVisible();
  await expect(page.getByRole("note")).toHaveCount(0);
});
