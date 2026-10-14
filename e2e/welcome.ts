import type { Page } from "@playwright/test";

/**
 * Skips the welcome a new account sees once (#364, #365) whenever it appears on `page`.
 *
 * The welcome is a modal dialog: while it is up, everything behind it is inert. A spec about
 * something else would otherwise have to dismiss it by hand at exactly the right moment. This
 * registers a handler that Playwright runs before any action or auto-waiting assertion that finds
 * the dialog in the way, and presses Skip, which is what a person in a hurry does.
 *
 * Call it once, right after making the page. Specs that are about the welcome itself
 * (`onboarding.spec.ts`) do not call it.
 */
export async function skipWelcomes(page: Page): Promise<void> {
  // Only the first step is ever up in a spec that does not walk it, and its title starts so.
  const welcome = page.getByRole("dialog", { name: /^Welcome/ });
  await page.addLocatorHandler(welcome, async () => {
    await page.getByRole("button", { name: "Skip", exact: true }).click();
  });
}
