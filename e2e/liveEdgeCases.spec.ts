import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { latestSignInLink, openSignInLink } from "./mailbox";
import {
  createAccountWithoutRole,
  insertAsAdmin,
  selectAsAdmin,
  signInAsNewAuthor,
  uniqueEmail,
  updateAsAdmin,
} from "./signIn";
import { skipWelcomes } from "./welcome";

// The edge cases of a live session for a class (ADR 0013) that need more than one browser: one
// member signed in on two devices (decision 1: one participant, the second device takes it over),
// and a member who joined as a guest and then signed in (decision 2: the guest row stays a guest,
// and the member joins as a second, linked participant). Neither device may be left on an error
// screen. Needs the local Supabase stack; CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// The seeded "Samples" bank (supabase/seed.sql), in the first workspace, which is the one
// signInAsNewAuthor makes the teacher an instructor in.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";
const CLASS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A student account of `orgId` on the class's roster, not yet signed in anywhere. */
async function rosterMember(
  request: APIRequestContext,
  orgId: string,
  classId: string,
  name: string,
): Promise<{ email: string; userId: string }> {
  const email = uniqueEmail("live-edge-member");
  const userId = await createAccountWithoutRole(request, email);
  await updateAsAdmin(request, "profiles", `id=eq.${userId}`, {
    org_id: orgId,
    role: "student",
    display_name: name,
  });
  await insertAsAdmin(request, "class_members", { class_id: classId, profile_id: userId });
  return { email, userId };
}

/** Signs `email` in on `page` with an emailed link, as classLiveSession.spec.ts does. */
async function signIn(page: Page, request: APIRequestContext, email: string) {
  await skipWelcomes(page);
  await page.goto("/sign-in");
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Sign in with an emailed link instead", exact: true })
    .click();
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email", exact: true })).toBeVisible();
  await openSignInLink(page, await latestSignInLink(request, email, since));
  await expect(page).toHaveURL(/\/learn$/);
}

/** The teacher's class session, started from the quiz page: its id and join code. */
async function startForClass(
  page: Page,
  request: APIRequestContext,
  projectName: string,
): Promise<{ sessionId: string; code: string; orgId: string; classId: string }> {
  await signInAsNewAuthor(page, request, projectName);
  const [samples] = await selectAsAdmin<{ org_id: string }>(
    request,
    "item_banks",
    `id=eq.${SAMPLES_BANK}&select=org_id`,
  );
  if (!samples) throw new Error("the seeded Samples bank is missing");
  const className = `NUR 320 ${projectName} ${Date.now() % 1_000_000}`;
  const joinCode = Array.from(
    randomBytes(8),
    (byte) => CLASS_CODE_ALPHABET[byte % CLASS_CODE_ALPHABET.length],
  ).join("");
  const madeClass = await insertAsAdmin<{ id: string }>(request, "classes", {
    org_id: samples.org_id,
    name: className,
    invite_token: randomBytes(24).toString("base64url"),
    join_code: joinCode,
  });

  await page.goto(`/author/banks/${SAMPLES_BANK}`);
  await page
    .getByRole("combobox", { name: "For a class", exact: true })
    .selectOption({ label: className });
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  return {
    sessionId: new URL(page.url()).pathname.split("/").at(-1) ?? "",
    code: (await page.getByTestId("join-code").innerText()).replace(/\s/g, ""),
    orgId: samples.org_id,
    classId: madeClass.id,
  };
}

async function joinSignedIn(phone: Page, code: string) {
  await phone.goto(`/join/${code}`);
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
}

test("one member on a phone and a laptop is one participant, and the first device is not stuck", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  const room = await startForClass(page, request, testInfo.project.name);
  const name = `Mia Chen ${Date.now() % 10_000}`;
  const member = await rosterMember(request, room.orgId, room.classId, name);

  const phone = await (await browser.newContext()).newPage();
  const laptop = await (await browser.newContext()).newPage();
  await signIn(phone, request, member.email);
  await signIn(laptop, request, member.email);
  await joinSignedIn(phone, room.code);
  await joinSignedIn(laptop, room.code);

  const rows = await selectAsAdmin<{ id: string; profile_id: string | null }>(
    request,
    "participants",
    `session_id=eq.${room.sessionId}&select=id,profile_id`,
  );
  expect(rows).toEqual([{ id: expect.any(String), profile_id: member.userId }]);

  // The teacher starts: the laptop gets the question; the phone, whose token the laptop's join
  // replaced, is told it is no longer in the room and is sent to the join page. No error screen.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(laptop.getByRole("button", { name: "Submit", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    phone
      .getByRole("heading", { name: "You are no longer in this live session.", exact: true })
      .or(phone.getByRole("button", { name: "Join", exact: true })),
  ).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText("This screen stopped working.", { exact: true })).toHaveCount(0);

  await phone.context().close();
  await laptop.context().close();
});

test("a member who joined as a guest and then signed in keeps the guest row and gets a linked one", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  const room = await startForClass(page, request, testInfo.project.name);
  const name = `Gia Park ${Date.now() % 10_000}`;
  const member = await rosterMember(request, room.orgId, room.classId, name);
  const guestName = `Gia ${Date.now() % 10_000}`;

  // Signed out on their own phone: an ordinary guest.
  const phone = await (await browser.newContext()).newPage();
  await phone.goto(`/join/${room.code}`);
  await phone.getByRole("textbox", { name: "Display name", exact: true }).fill(guestName);
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone).toHaveURL(/\/play\/[0-9a-f-]{36}$/);

  // Mid-session they sign in on the same phone. Reloading the room keeps them the guest.
  await signIn(phone, request, member.email);
  await phone.goto(`/play/${room.sessionId}`);
  await expect(phone).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  let rows = await selectAsAdmin<{ display_name: string; profile_id: string | null }>(
    request,
    "participants",
    `session_id=eq.${room.sessionId}&select=display_name,profile_id`,
  );
  expect(rows).toEqual([{ display_name: guestName, profile_id: null }]);

  // Opening the join page again joins them as themselves: a second participant, linked.
  await joinSignedIn(phone, room.code);
  rows = await selectAsAdmin<{ display_name: string; profile_id: string | null }>(
    request,
    "participants",
    `session_id=eq.${room.sessionId}&select=display_name,profile_id&order=joined_at`,
  );
  expect(rows).toEqual([
    { display_name: guestName, profile_id: null },
    { display_name: name, profile_id: member.userId },
  ]);

  await phone.context().close();
});
