import { BlockList, isIP } from "node:net";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { latestSignInLink } from "./mailbox";

// The local stack's API gateway, next to the test mailbox in mailbox.ts (see supabase/config.toml).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";

export function uniqueEmail(label: string): string {
  return `author-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

const LOOPBACK = new BlockList();
LOOPBACK.addSubnet("127.0.0.0", 8);
LOOPBACK.addAddress("::1", "ipv6");

/**
 * Whether a parsed URL's host is this machine.
 *
 * Asked of the address, not of the string. `new URL()` has already done the hard part: it
 * canonicalises `127.1`, `0x7f000001`, `2130706433` and `0177.0.0.1` all to `127.0.0.1`, lower-
 * cases the name, and strips any `user@` in front of the real host, so `http://localhost@evil.com`
 * arrives here as `evil.com`. What is left to get wrong is pattern-matching, and a `/^127\./` test
 * gets it wrong: it is anchored at the start only, so `127.0.0.1.evil.com` and `127.evil.com` pass
 * it, and both are names anybody can register. `isIP` refuses anything that is not an address at
 * all, which is what closes that, and `BlockList` answers the subnet question properly — including
 * for the IPv4-mapped form `[::ffff:127.0.0.1]`, which arrives serialised as `[::ffff:7f00:1]` and
 * which no string comparison would have recognised. A trailing dot (`localhost.`) is a different
 * name to the parser and is refused; nothing writes it, and failing closed there is the right way
 * round for a guard.
 */
function isThisMachine(hostname: string): boolean {
  if (hostname === "localhost") return true;
  // `new URL()` brackets an IPv6 host; `isIP` and `BlockList` want it bare.
  const host = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  const family = isIP(host);
  if (family === 0) return false;
  return LOOPBACK.check(host, family === 6 ? "ipv6" : "ipv4");
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
  if (!isThisMachine(hostname)) {
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
