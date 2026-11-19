import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import { wireText } from "./bytes";
import { latestSignInLink, openSignInLink } from "./mailbox";
import { createAccountWithoutRole, uniqueEmail, updateAsAdmin } from "./signIn";

// The people an AI import page must hand nothing to (#346, #593): shared by the specs that grep a
// response for a staged question's source and key. Every grep here needs its control, made by the
// caller with the batch's own teacher: the same text found in the same page.

/** A student account signed in through the emailed link, in a browser of its own. */
export async function signedInStudent(
  browser: Browser,
  request: APIRequestContext,
  label: string,
  orgId: string,
) {
  const email = uniqueEmail(label);
  const userId = await createAccountWithoutRole(request, email);
  // A student of the batch's own workspace: the nearest a student gets to its keys.
  await updateAsAdmin(request, "profiles", `id=eq.${userId}`, { org_id: orgId, role: "student" });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Sign in with an emailed link instead", exact: true })
    .click();
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await openSignInLink(page, await latestSignInLink(request, email, since));
  return { context, page };
}

/**
 * Asks for each author path as `visitor` and checks it is turned away with none of `secrets` in
 * the bytes it is sent: a redirect off `/author` (a student, or nobody signed in), or not found.
 */
export async function expectTurnedAway(
  visitor: BrowserContext,
  paths: readonly string[],
  secrets: readonly string[],
  who: string,
) {
  for (const path of paths) {
    const got = await visitor.request.get(path);
    const landed = new URL(got.url()).pathname;
    expect(
      got.status() === 404 || !landed.startsWith("/author"),
      `${who} asking for ${path}: status ${got.status()}, landed on ${landed}`,
    ).toBe(true);
    const bytes = wireText(await got.text());
    for (const secret of secrets) {
      expect(bytes, `${who} asking for ${path} was sent ${secret}`).not.toContain(secret);
    }
  }
}
