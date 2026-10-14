import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

/**
 * #336: in the case study's patient record editor an author holds a note back until Step 4 and
 * locks a tab at Steps 1 and 2, previews the patient record at Step 2 and Step 4, and the choices
 * are still there after a reload.
 */
test("an author sets when a note and a tab show, and previews the patient record by step", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(4 * 60_000);
  const shots = `test-results/screenshots/${testInfo.project.name}`;
  await signInAsNewAuthor(page, request, testInfo.project.name);

  await page
    .getByRole("textbox", { name: "Quiz name" })
    .fill(`Timing ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await page.getByRole("textbox", { name: "Case study title" }).fill("Hyperkalemia, day 2");
  await page.getByRole("button", { name: "Create case study" }).click();
  await expect(page).toHaveURL(/\/author\/case-studies\/[0-9a-f-]{36}$/);

  const textbox = (name: string) => page.getByRole("textbox", { name, exact: true });
  const select = (name: string) => page.getByRole("combobox", { name, exact: true });

  await textbox("Age in years").fill("66");
  await select("Sex").selectOption("male");
  await textbox("Care setting").fill("Renal unit");

  // Tab 1: nurses' notes, the second note held back until Step 4.
  await select("Tab kind").selectOption("nurses_notes");
  await page.getByRole("button", { name: "Add tab", exact: true }).click();
  await textbox("Tab 1, block 1, Text").fill("0800: Alert and oriented. Reports mild nausea.");
  await page.getByRole("button", { name: "Add text to tab 1", exact: true }).click();
  await textbox("Tab 1, block 2, Text").fill("1200: Reports muscle weakness in both legs.");
  await select("Tab 1, block 2, Shows from").selectOption("4");

  // Tab 2: lab results, locked at Steps 1 and 2.
  await select("Tab kind").selectOption("lab_results");
  await page.getByRole("button", { name: "Add tab", exact: true }).click();
  await textbox("Tab 2, block 1, row 1, Measure").fill("Potassium");
  await textbox("Tab 2, block 1, row 1, Value").fill("6.1");
  const labsRow = page.locator("details").filter({ hasText: "Lab Results:" });
  await expect(labsRow.locator("summary")).toContainText("Open at Steps 1–6");
  await labsRow.locator("summary").click();
  const lockedAtOne = select("Lab Results, Step 1");
  await lockedAtOne.selectOption("locked");
  await select("Lab Results, Step 2").selectOption("locked");
  await expect(labsRow.locator("summary")).toContainText("Locked at Steps 1–2, open at Steps 3–6");

  // 44px tap targets, and no sideways scrolling at any width.
  expect((await lockedAtOne.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await labsRow.locator("summary").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await labsRow.screenshot({ path: `${shots}/tab-timing-step-row.png` });

  await page.getByRole("button", { name: "Save patient record" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Patient record saved." })).toBeVisible();
  await expectNoAxeViolations(page);

  // The preview at Step 2: no 1200 note, and the labs tab listed as Locked.
  const preview = page.getByRole("region", { name: "Preview", exact: true });
  await preview.getByRole("combobox", { name: "Preview at" }).selectOption("2");
  await expect(preview.getByText(/Alert and oriented/)).toBeVisible();
  await expect(preview.getByText(/muscle weakness/)).toHaveCount(0);
  const labs = preview.getByRole("tab", { name: /Lab Results/ });
  await expect(labs).toContainText("Locked");
  await expect(labs).toHaveAttribute("aria-disabled", "true");
  await expectNoAxeViolations(page);
  await preview.screenshot({ path: `${shots}/tab-timing-preview-step-2.png` });

  // The preview at Step 4: both show.
  await preview.getByRole("combobox", { name: "Preview at" }).selectOption("4");
  await expect(preview.getByText(/muscle weakness/)).toBeVisible();
  await expect(labs).not.toHaveAttribute("aria-disabled", "true");
  await expect(labs).not.toContainText("Locked");
  await labs.click();
  await expect(preview.getByText("Potassium")).toBeVisible();
  await preview.screenshot({ path: `${shots}/tab-timing-preview-step-4.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  // Saved, not just shown: the choices are there after a reload.
  await page.reload();
  await expect(select("Tab 1, block 2, Shows from")).toHaveValue("4");
  await expect(select("Tab 1, block 1, Shows from")).toHaveValue("1");
  await expect(labsRow.locator("summary")).toContainText("Locked at Steps 1–2, open at Steps 3–6");
  await page.screenshot({ path: `${shots}/tab-timing-editor.png`, fullPage: true });
});
