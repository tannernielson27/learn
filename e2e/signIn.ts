import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { latestSignInLink } from "./mailbox";

// The local stack's API gateway, next to the test mailbox in mailbox.ts (see supabase/config.toml).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";

export function uniqueEmail(label: string): string {
  return `author-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/**
 * The Supabase to create test users on, refused unless it is the local stack.
 *
 * `SUPABASE_SECRET_KEY` is the same variable name production uses (`src/lib/supabase/service.ts`),
 * and `NEXT_PUBLIC_SUPABASE_URL` is the same one the app reads, so a shell or a `.env.local` left
 * pointing at a hosted project would have this suite creating real accounts on it with a real
 * service key. A comment is not enough of a guard for a call that writes users, so this checks
 * the host it is about to write to and stops before the key is used.
 */
function localStackUrl(): string {
  const { hostname } = new URL(SUPABASE_URL);
  const loopback = hostname === "localhost" || hostname === "[::1]" || /^127\./.test(hostname);
  if (!loopback) {
    throw new Error(
      `refusing to create test users on ${hostname}: these tests use SUPABASE_SECRET_KEY, which ` +
        `is the same variable production uses. Point NEXT_PUBLIC_SUPABASE_URL at the local stack.`,
    );
  }
  return SUPABASE_URL;
}

/**
 * Creates the account first, the way the owner creates one.
 *
 * #139 turned `shouldCreateUser` off, so the sign-in form no longer signs anyone up: an address
 * with no account is answered exactly like one that has an account and is simply never mailed.
 * A test that only filled the form would wait out `latestSignInLink` for an email that was never
 * sent. This admin call stands in for the Supabase dashboard; `on_auth_user_created` gives the
 * new user its profile and org either way, so the journey under test is unchanged.
 */
export async function createAuthorAccount(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const url = localStackUrl();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  // A plain throw, not `expect(...).toBeTruthy()`: Playwright's matchers are not TypeScript
  // assertion signatures, so the expect form left `secretKey` possibly undefined and needed two
  // non-null assertions to compile. This narrows it for real.
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY must name the local stack's secret key");
  }
  const created = await request.post(`${url}/auth/v1/admin/users`, {
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    data: { email, email_confirm: true },
  });
  if (!created.ok()) {
    throw new Error(`could not create ${email}: ${created.status()} ${await created.text()}`);
  }
}

/** Signs in a brand-new account through the emailed link and waits for the author home. */
export async function signInAsNewAuthor(
  page: Page,
  request: APIRequestContext,
  label: string,
): Promise<string> {
  const email = uniqueEmail(label);
  await createAuthorAccount(request, email);
  await page.goto("/sign-in");
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await latestSignInLink(request, email, since));
  await expect(page).toHaveURL(/\/author$/);
  return email;
}
