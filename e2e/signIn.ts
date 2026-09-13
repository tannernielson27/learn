import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { latestSignInLink } from "./mailbox";

export function uniqueEmail(label: string): string {
  return `author-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** Signs in a brand-new account through the emailed link and waits for the author home. */
export async function signInAsNewAuthor(
  page: Page,
  request: APIRequestContext,
  label: string,
): Promise<string> {
  const email = uniqueEmail(label);
  await page.goto("/sign-in");
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await latestSignInLink(request, email, since));
  await expect(page).toHaveURL(/\/author$/);
  return email;
}
