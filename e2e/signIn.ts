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

interface LocalAdmin {
  url: string;
  headers: Record<string, string>;
}

function localAdmin(): LocalAdmin {
  const url = localStackUrl();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  // A plain throw, not `expect(...).toBeTruthy()`: Playwright's matchers are not TypeScript
  // assertion signatures, so the expect form left `secretKey` possibly undefined and needed two
  // non-null assertions to compile. This narrows it for real.
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY must name the local stack's secret key");
  }
  return { url, headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` } };
}

/**
 * Creates an account the way the owner's Add user does, and nothing more: since #204 the sign-up
 * trigger gives it a profile with no org and no role, so it can sign in and author nothing.
 *
 * #139 turned `shouldCreateUser` off, so the sign-in form no longer signs anyone up: an address
 * with no account is answered exactly like one that has an account and is simply never mailed.
 * A test that only filled the form would wait out `latestSignInLink` for an email that was never
 * sent. This admin call stands in for the Supabase dashboard.
 */
export async function createAccountWithoutRole(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const { url, headers } = localAdmin();
  const created = await request.post(`${url}/auth/v1/admin/users`, {
    headers,
    data: { email, email_confirm: true },
  });
  if (!created.ok()) {
    throw new Error(`could not create ${email}: ${created.status()} ${await created.text()}`);
  }
  const { id } = (await created.json()) as { id: string };
  return id;
}

/**
 * The second of the owner's two steps (#204): what `private.make_instructor` does, through the
 * Data API with the local secret key, which bypasses RLS. The account joins the first org, the
 * seeded one, as an instructor.
 */
async function makeInstructor(request: APIRequestContext, userId: string): Promise<void> {
  const { url, headers } = localAdmin();
  const firstOrg = `${url}/rest/v1/orgs?select=id&order=created_at.asc,id.asc&limit=1`;
  const orgs = await request.get(firstOrg, { headers });
  const [org] = orgs.ok() ? ((await orgs.json()) as { id: string }[]) : [];
  if (!org) throw new Error(`no org to make ${userId} an instructor in: ${orgs.status()}`);
  const updated = await request.patch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
    headers: { ...headers, Prefer: "return=representation" },
    data: { org_id: org.id, role: "instructor" },
  });
  const rows = updated.ok() ? ((await updated.json()) as unknown[]) : [];
  if (rows.length !== 1) {
    throw new Error(`could not make ${userId} an instructor: ${updated.status()}`);
  }
}

/**
 * Inserts one row with the local secret key, as a test's stand-in for setup it is not about (#208
 * assigns the seeded bank this way rather than through the Assign form #207's spec covers).
 * Returns the row as written. Local stack only, like everything here.
 */
export async function insertAsAdmin<T>(
  request: APIRequestContext,
  table: string,
  row: Record<string, unknown>,
): Promise<T> {
  const { url, headers } = localAdmin();
  const created = await request.post(`${url}/rest/v1/${table}`, {
    headers: { ...headers, Prefer: "return=representation" },
    data: row,
  });
  const rows = created.ok() ? ((await created.json()) as T[]) : [];
  if (rows.length !== 1) {
    throw new Error(`could not insert into ${table}: ${created.status()} ${await created.text()}`);
  }
  return rows[0] as T;
}

/** Reads rows with the local secret key, which sees every column, for a test's control. */
export async function selectAsAdmin<T>(
  request: APIRequestContext,
  table: string,
  query: string,
): Promise<T[]> {
  const { url, headers } = localAdmin();
  const read = await request.get(`${url}/rest/v1/${table}?${query}`, { headers });
  if (!read.ok()) throw new Error(`could not read ${table}: ${read.status()}`);
  return (await read.json()) as T[];
}

/**
 * Updates the rows `query` picks with the local secret key and returns them as written, for setup a
 * test is not about (#244 gives a student a display name this way). Refuses to touch no rows.
 */
export async function updateAsAdmin<T>(
  request: APIRequestContext,
  table: string,
  query: string,
  patch: Record<string, unknown>,
): Promise<T[]> {
  const { url, headers } = localAdmin();
  const updated = await request.patch(`${url}/rest/v1/${table}?${query}`, {
    headers: { ...headers, Prefer: "return=representation" },
    data: patch,
  });
  const rows = updated.ok() ? ((await updated.json()) as T[]) : [];
  if (rows.length === 0) {
    throw new Error(`could not update ${table}: ${updated.status()} ${await updated.text()}`);
  }
  return rows;
}

/** Creates an author: Add user, then the promotion, as the owner does it since #204. */
export async function createAuthorAccount(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const userId = await createAccountWithoutRole(request, email);
  await makeInstructor(request, userId);
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

/** Inserts several rows in one request with the local secret key; returns them as written. */
export async function insertManyAsAdmin<T>(
  request: APIRequestContext,
  table: string,
  rows: readonly Record<string, unknown>[],
): Promise<T[]> {
  const { url, headers } = localAdmin();
  const created = await request.post(`${url}/rest/v1/${table}`, {
    headers: { ...headers, Prefer: "return=representation" },
    data: rows,
  });
  const written = created.ok() ? ((await created.json()) as T[]) : [];
  if (written.length !== rows.length) {
    throw new Error(`could not insert into ${table}: ${created.status()} ${await created.text()}`);
  }
  return written;
}

/** Calls a service-role-only database function with the local secret key, for setup. */
export async function rpcAsAdmin<T>(
  request: APIRequestContext,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { url, headers } = localAdmin();
  const called = await request.post(`${url}/rest/v1/rpc/${fn}`, { headers, data: args });
  if (!called.ok()) throw new Error(`${fn} failed: ${called.status()} ${await called.text()}`);
  return (await called.json()) as T;
}

function localPublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must name the local stack's key");
  return key;
}

/**
 * An access token for an account that already exists, for setup that has to run as that user
 * (#273 starts and saves a student's attempt through the student's own functions, which take the
 * caller from the token). Gives the account a random password with the local secret key, then
 * signs in with it through the publishable key, as a browser would. Local stack only.
 */
export async function accessTokenFor(
  request: APIRequestContext,
  userId: string,
  email: string,
): Promise<string> {
  const { url, headers } = localAdmin();
  const password = `e2e-${crypto.randomUUID()}`;
  const updated = await request.put(`${url}/auth/v1/admin/users/${userId}`, {
    headers,
    data: { password },
  });
  if (!updated.ok()) {
    throw new Error(`could not set a password: ${updated.status()} ${await updated.text()}`);
  }
  const signedIn = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: localPublishableKey() },
    data: { email, password },
  });
  const body = signedIn.ok() ? ((await signedIn.json()) as { access_token?: unknown }) : {};
  if (typeof body.access_token !== "string") {
    throw new Error(`could not sign in as ${email}: ${signedIn.status()}`);
  }
  return body.access_token;
}

/** Calls a database function as the user whose access token this is, under their own grants. */
export async function rpcAsUser<T>(
  request: APIRequestContext,
  accessToken: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const called = await request.post(`${localStackUrl()}/rest/v1/rpc/${fn}`, {
    headers: { apikey: localPublishableKey(), Authorization: `Bearer ${accessToken}` },
    data: args,
  });
  if (!called.ok()) throw new Error(`${fn} failed: ${called.status()} ${await called.text()}`);
  return (await called.json()) as T;
}
