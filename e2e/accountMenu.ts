import { expect, type Page } from "@playwright/test";

/**
 * Opens the account menu, where Account, Help, the theme and Sign out live since the UI
 * overhaul's app shell (docs/ui-overhaul). It is a native popover behind one named button.
 */
export async function openAccountMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
}

/**
 * Checks who the header says is signed in. Since #563 (owner decision 2026-11-14, docs/04 §11)
 * the bar shows only the initials: the name, or the email address of an account with no name,
 * is at the top of the account menu. So this checks it is not in the bar, opens the menu, reads
 * it there, and closes the menu again (Escape) so the page is as the caller left it.
 */
export async function expectSignedInAs(
  page: Page,
  who: "signed-in-name" | "signed-in-email",
  text: string,
): Promise<void> {
  const shown = page.getByTestId(who);
  await expect(shown).toBeHidden();
  await openAccountMenu(page);
  await expect(shown).toBeVisible();
  await expect(shown).toHaveText(text);
  await page.keyboard.press("Escape");
  await expect(shown).toBeHidden();
}
