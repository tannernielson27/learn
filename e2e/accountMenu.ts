import type { Page } from "@playwright/test";

/**
 * Opens the account menu, where Account, Help, the theme and Sign out live since the UI
 * overhaul's app shell (docs/ui-overhaul). It is a native popover behind one named button.
 */
export async function openAccountMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
}
