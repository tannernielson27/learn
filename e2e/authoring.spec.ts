import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("an author creates a bank, starts an item by type, and finds the draft in the bank", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  await expect(page.getByRole("heading", { level: 1, name: "Item banks" })).toBeVisible();
  await expectNoAxeViolations(page);

  const bankName = `Cardiac ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();

  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  await expect(
    page.getByText("No items in this bank yet. Choose New item to write one."),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("link", { name: "New item" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New item" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bowtie" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Extended Multiple Response" }).click();
  await expect(page).toHaveURL(/\/author\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Extended Multiple Response")).toBeVisible();

  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(page.getByRole("link", { name: /Untitled item/ })).toContainText("Draft");

  await page.getByRole("link", { name: "Item banks" }).click();
  await expect(page.getByRole("link", { name: new RegExp(bankName) })).toContainText("1 item");
});

test("an author writes a multiple choice item beside its preview, saves a draft, then publishes", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  await page
    .getByRole("textbox", { name: "Bank name" })
    .fill(`Editor ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create bank" }).click();
  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/items\/[0-9a-f-]{36}$/);

  const problems = page.getByRole("region", { name: "Problems to fix" });
  await expect(problems.getByRole("button", { name: "Write the question stem." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  await page
    .getByRole("textbox", { name: "Question stem" })
    .fill("Which action should the nurse take first?");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();

  const preview = page.getByRole("region", { name: "Preview" });
  const answers = [
    "Assess the airway",
    "Call the provider",
    "Document the finding",
    "Reassess in an hour",
  ];
  for (const [index, text] of answers.entries()) {
    // Exact: Playwright matches names by substring, and "Why option A is right or wrong" contains
    // "option A".
    await page.getByRole("textbox", { name: `Option ${"ABCD"[index]}`, exact: true }).fill(text);
  }
  await page.getByRole("radio", { name: "Option A is correct" }).check();
  await expect(preview.getByText("Which action should the nurse take first?")).toBeVisible();
  await expect(preview.getByText("Assess the airway")).toBeVisible();
  await expect(problems).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(
    page.getByRole("link", { name: /Which action should the nurse take first\?/ }),
  ).toContainText("Published");

  // A reload opens exactly what was published.
  await page.getByRole("link", { name: /Which action should the nurse take first\?/ }).click();
  await expect(page.getByRole("textbox", { name: "Option C", exact: true })).toHaveValue(
    "Document the finding",
  );
  await expect(page.getByRole("radio", { name: "Option A is correct" })).toBeChecked();
});

test("an author writes a select-all-that-apply item, marks three answers, and publishes", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  await page
    .getByRole("textbox", { name: "Bank name" })
    .fill(`SATA ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create bank" }).click();
  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Extended Multiple Response", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/items\/[0-9a-f-]{36}$/);

  const problems = page.getByRole("region", { name: "Problems to fix" });
  await expect(
    problems.getByRole("button", { name: "Mark at least one option as correct." }),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "Question stem" })
    .fill("Which findings require immediate follow-up?");
  const findings = [
    "Respiratory rate 28",
    "Oxygen saturation 89%",
    "Temperature 37.2 °C",
    "New confusion",
    "Productive cough",
  ];
  for (const [index, text] of findings.entries()) {
    const letter = "ABCDE"[index];
    await page.getByRole("textbox", { name: `Option ${letter}`, exact: true }).fill(text);
  }
  for (const letter of ["A", "B", "D"]) {
    await page.getByRole("checkbox", { name: `Option ${letter} is correct` }).check();
  }

  const preview = page.getByRole("region", { name: "Preview" });
  await expect(preview.getByText("Oxygen saturation 89%").first()).toBeVisible();
  await expect(problems).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(
    page.getByRole("link", { name: /Which findings require immediate follow-up\?/ }),
  ).toContainText("Published");
});

test("an unknown bank is a not-found page, not an error", async ({ page, request }, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const response = await page.goto("/author/banks/00000000-0000-4000-8000-00000000dead");
  expect(response?.status()).toBe(404);
  const malformed = await page.goto("/author/banks/not-a-bank");
  expect(malformed?.status()).toBe(404);
});
