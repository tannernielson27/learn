// Fill an item editor already open on the page, on its own page or as a case study step, leaving
// it valid and ready to publish.
import { expect, type Page } from "@playwright/test";

const textbox = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const letter = (index: number) => "ABCDEFGHIJ"[index]!;

export async function fillMultipleChoice(page: Page, stem: string, options: string[], correct = 0) {
  await textbox(page, "Question stem").fill(stem);
  for (const [index, text] of options.entries()) {
    // Exact: "Why option A is right or wrong" also contains "option A".
    await textbox(page, `Option ${letter(index)}`).fill(text);
  }
  await page.getByRole("radio", { name: `Option ${letter(correct)} is correct` }).check();
}

export async function fillMultipleResponse(
  page: Page,
  stem: string,
  options: string[],
  correct: number[],
) {
  await textbox(page, "Question stem").fill(stem);
  for (const [index, text] of options.entries()) {
    await textbox(page, `Option ${letter(index)}`).fill(text);
  }
  for (const index of correct) {
    await page.getByRole("checkbox", { name: `Option ${letter(index)} is correct` }).check();
  }
}

export async function fillMatrixMultipleChoice(
  page: Page,
  stem: string,
  columns: [string, string],
  rows: { text: string; answer: string }[],
) {
  await textbox(page, "Question stem").fill(stem);
  await textbox(page, "Column 1").fill(columns[0]);
  await textbox(page, "Column 2").fill(columns[1]);
  for (const [index, row] of rows.entries()) {
    const group = page.getByRole("group", { name: `Row ${index + 1}`, exact: true });
    await group.getByRole("textbox", { name: "Row text" }).fill(row.text);
    await group
      .getByRole("radiogroup", { name: `Correct column for row ${index + 1}` })
      // Exact: "Likely" is also part of "Unlikely".
      .getByRole("radio", { name: row.answer, exact: true })
      .check();
  }
}

/**
 * Ordered response: steps are written in their correct order ("Step N" inputs), adding inputs with
 * "Add step" until there are enough. The schema takes 4 to 6 steps.
 */
export async function fillOrderedResponse(page: Page, stem: string, steps: string[]) {
  await textbox(page, "Question stem").fill(stem);
  for (const [index, text] of steps.entries()) {
    const field = textbox(page, `Step ${index + 1}`);
    if ((await field.count()) === 0) {
      await page.getByRole("button", { name: "Add step", exact: true }).click();
    }
    await field.fill(text);
  }
}

/** Publishes the open editor and waits for it to say so. */
export async function publishOpenItem(page: Page) {
  await expect(page.getByRole("region", { name: "Problems to fix" })).toHaveCount(0);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
}
