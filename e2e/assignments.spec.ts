import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fillMultipleChoice, publishOpenItem } from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// #207: assign a bank to a class; it appears in the class's list in the viewer's local time.
// Needs the local Supabase stack, like classes.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// A zone far from UTC (and from the CI runner's), so a time shown in the wrong zone cannot pass.
test.use({ timezoneId: "Pacific/Auckland" });

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A `datetime-local` value as the list should show it: the same wall-clock time, so no zone is
 * involved. The weekday of a calendar date is the same in every zone, hence Date.UTC.
 */
function shownAs(localValue: string): string {
  const [date, time] = localValue.split("T") as [string, string];
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]} ${year}, ${time.slice(0, 5)}`;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

test("an instructor assigns a bank to a class and sees it listed in local time", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, a class, a bank and a published item before the assignment itself.
  test.slow();
  const project = testInfo.project.name;
  await signInAsNewAuthor(page, request, `assign-${project}`);

  const className = `NUR 310 ${Date.now() % 100_000}`;
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(className);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: className, exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No assignments yet", exact: true }),
  ).toBeVisible();

  await page.goto("/author");
  const bankName = `Assigned ${project} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
  await fillMultipleChoice(
    page,
    "Which finding is expected?",
    ["Bradycardia", "Tachycardia", "Hypotension", "Bounding pulses"],
    1,
  );
  await publishOpenItem(page);
  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  // Assign sits beside Start a live session.
  await page.getByRole("link", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/banks\/[0-9a-f-]{36}\/assign$/);
  await expect(page.getByRole("heading", { level: 1, name: bankName, exact: true })).toBeVisible();

  const opens = page.getByLabel("Opens", { exact: true });
  const closes = page.getByLabel("Closes", { exact: true });
  await expect(closes).toHaveValue(/T17:00$/);
  await expect(page.getByRole("combobox", { name: "Attempts", exact: true })).toHaveValue("1");
  await expect(
    page.getByRole("checkbox", { name: "Shuffle answer options", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("combobox", { name: "Class", exact: true })
    .selectOption({ label: className });
  const opensValue = await opens.inputValue();
  const closesValue = await closes.inputValue();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `test-results/screenshots/${project}/assign.png`, fullPage: true });

  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: className, exact: true })).toBeVisible();

  const list = page.getByRole("list", { name: "Assignments", exact: true });
  const row = list.getByRole("listitem").filter({ hasText: bankName });
  await expect(row).toContainText("Open");
  await expect(row).toContainText(`Opens ${shownAs(opensValue)}`);
  await expect(row).toContainText(`Closes ${shownAs(closesValue)}`);
  await expect(row).toContainText("1 attempt");
  // Open already, so only the close time can change and it cannot be deleted.
  await expect(row.getByText("Change close time", { exact: false })).toBeVisible();
  await expect(row.getByRole("button", { name: `Delete ${bankName}`, exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${project}/class-assignments.png`,
    fullPage: true,
  });
});
