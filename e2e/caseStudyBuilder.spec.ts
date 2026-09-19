import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  fillMatrixMultipleChoice,
  fillMultipleChoice,
  fillMultipleResponse,
  fillOrderedResponse,
  publishOpenItem,
} from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

const MINUTES = 60_000;

test("the site header asks before leaving unsaved work in the builder, as Back to bank does", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  await page
    .getByRole("textbox", { name: "Bank name" })
    .fill(`Guard ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create bank" }).click();
  await page.getByRole("textbox", { name: "Case study title" }).fill("Unsaved record");
  await page.getByRole("button", { name: "New case study" }).click();
  await expect(page).toHaveURL(/\/author\/case-studies\/[0-9a-f-]{36}$/);
  const builderUrl = page.url();

  await page.getByRole("textbox", { name: "Age in years", exact: true }).fill("72");
  await page.getByRole("banner").getByRole("link", { name: "LeaRN" }).click();
  const ask = page.getByRole("alertdialog", { name: "The record has unsaved changes" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Stay on this step" }).click();
  expect(page.url()).toBe(builderUrl);
  await expect(page.getByRole("textbox", { name: "Age in years", exact: true })).toHaveValue("72");

  await page.getByRole("banner").getByRole("link", { name: "LeaRN" }).click();
  await ask.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(/\/author$/);
});

test("an author builds a complete case study from an empty bank, previews it, and publishes it in under ten minutes", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(12 * MINUTES);
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const started = Date.now();

  await page
    .getByRole("textbox", { name: "Bank name" })
    .fill(`Case ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create bank" }).click();
  await page
    .getByRole("textbox", { name: "Case study title" })
    .fill("Heart failure, admission day");
  await page.getByRole("button", { name: "New case study" }).click();
  await expect(page).toHaveURL(/\/author\/case-studies\/[0-9a-f-]{36}$/);

  const rail = page.getByRole("navigation", { name: "Case study steps" });
  const textbox = (name: string) => page.getByRole("textbox", { name, exact: true });
  const select = (name: string) => page.getByRole("combobox", { name, exact: true });

  // The record, with two tabs.
  await textbox("Age in years").fill("72");
  await select("Sex").selectOption("female");
  await textbox("Care setting").fill("Cardiac unit");
  await select("New section kind").selectOption("history_physical");
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await textbox("Section 1, block 1, Text").fill(
    "Admitted with worsening shortness of breath and swelling of both ankles.",
  );
  await select("New section kind").selectOption("vital_signs");
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await textbox("Section 2, block 1, row 1, Measure").fill("Heart rate");
  await textbox("Section 2, block 1, row 1, Value").fill("112");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Record saved." })).toBeVisible();
  await expect(rail.getByRole("button", { name: /^Record/ })).toContainText("Ready");
  await expectNoAxeViolations(page);

  // Six steps of mixed types, each written and published in place.
  const steps: { name: RegExp; type: string; fill: () => Promise<void> }[] = [
    {
      name: /^Step 1: Recognize Cues/,
      type: "Multiple Choice",
      fill: () =>
        fillMultipleChoice(page, "Which finding needs attention first?", [
          "Heart rate 112",
          "Age 72",
          "Admitted to the cardiac unit",
          "Ankle swelling for a week",
        ]),
    },
    {
      name: /^Step 2: Analyze Cues/,
      type: "Extended Multiple Response",
      fill: () =>
        fillMultipleResponse(
          page,
          "Which findings suggest fluid overload?",
          [
            "Swelling of both ankles",
            "Shortness of breath",
            "Pale yellow urine",
            "Normal appetite",
            "Steady weight",
          ],
          [0, 1],
        ),
    },
    {
      name: /^Step 3: Prioritize Hypotheses/,
      type: "Matrix Multiple Choice",
      fill: () =>
        fillMatrixMultipleChoice(
          page,
          "For each condition, is it likely or unlikely?",
          ["Likely", "Unlikely"],
          [
            { text: "Fluid overload", answer: "Likely" },
            { text: "Dehydration", answer: "Unlikely" },
          ],
        ),
    },
    {
      name: /^Step 4: Generate Solutions/,
      type: "Ordered Response",
      fill: () =>
        fillOrderedResponse(page, "Put the nurse's first actions in order.", [
          "Raise the head of the bed",
          "Apply oxygen as prescribed",
          "Weigh the client",
          "Document the findings",
        ]),
    },
    {
      name: /^Step 5: Take Action/,
      type: "Multiple Choice",
      fill: () =>
        fillMultipleChoice(page, "Which prescription should the nurse carry out first?", [
          "Give the prescribed diuretic",
          "Encourage oral fluids",
          "Lower the head of the bed",
          "Hold all morning medications",
        ]),
    },
    {
      name: /^Step 6: Evaluate Outcomes/,
      type: "Matrix Multiple Choice",
      fill: () =>
        fillMatrixMultipleChoice(
          page,
          "For each finding, has it improved or declined?",
          ["Improved", "Declined"],
          [
            { text: "Breathing at rest", answer: "Improved" },
            { text: "Ankle swelling", answer: "Improved" },
          ],
        ),
    },
  ];
  for (const step of steps) {
    await rail.getByRole("button", { name: step.name }).click();
    await page.getByRole("button", { name: step.type, exact: true }).click();
    await expect(page.getByRole("button", { name: "Change type" })).toBeVisible();
    await step.fill();
    await publishOpenItem(page);
    await expect(rail.getByRole("button", { name: step.name })).toContainText("Ready");
    await expectNoAxeViolations(page);
  }
  await expect(rail).toContainText("6 of 6 steps ready");

  // Preview it as a student would see it.
  await page.getByRole("button", { name: "Preview case study" }).click();
  await expect(page.getByRole("button", { name: "Back to editing" })).toBeVisible();
  await expect(page.getByText("Which finding needs attention first?").first()).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/case-study-preview.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to editing" }).click();

  // Publish the whole case study.
  await page.getByRole("button", { name: "Publish case study" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Case study published." })).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  expect(Date.now() - started).toBeLessThan(10 * MINUTES);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/case-study-published.png`,
    fullPage: true,
  });
});
