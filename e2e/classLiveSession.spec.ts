import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
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

// A live session for a class (ADR 0013). A teacher starts one from the quiz page with "For a
// class"; a signed-in member of the class joins, is told so on the join page, and is linked to
// their account; a guest joins the same session with a code and a name, as anyone always could.
// The report has no column for the link yet (a later PR), so it is asserted by name there and in
// the database here. Needs the local Supabase stack; CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// The seeded "Samples" bank (supabase/seed.sql), in the first workspace, which is the one
// signInAsNewAuthor makes the teacher an instructor in.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";
const CLASS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A class written with the local secret key, as studentWorkspaces.spec.ts writes one. */
async function makeClass(request: APIRequestContext, orgId: string, name: string) {
  const code = Array.from(
    randomBytes(8),
    (byte) => CLASS_CODE_ALPHABET[byte % CLASS_CODE_ALPHABET.length],
  ).join("");
  return insertAsAdmin<{ id: string }>(request, "classes", {
    org_id: orgId,
    name,
    invite_token: randomBytes(24).toString("base64url"),
    join_code: code,
  });
}

/** A student of `orgId` on the class's roster, signed in on a page of its own. */
async function signedInMember(
  browser: Browser,
  request: APIRequestContext,
  orgId: string,
  classId: string,
  name: string,
): Promise<{ page: Page; userId: string }> {
  const email = uniqueEmail("class-live-member");
  const userId = await createAccountWithoutRole(request, email);
  await updateAsAdmin(request, "profiles", `id=eq.${userId}`, {
    org_id: orgId,
    role: "student",
    display_name: name,
  });
  await insertAsAdmin(request, "class_members", { class_id: classId, profile_id: userId });

  const page = await (await browser.newContext()).newPage();
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
  return { page, userId };
}

test("a teacher starts a live session for a class; a signed-in member is linked and a guest is not", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  const stamp = `${testInfo.project.name} ${Date.now() % 1_000_000}`;
  await signInAsNewAuthor(page, request, testInfo.project.name);

  const [samples] = await selectAsAdmin<{ org_id: string }>(
    request,
    "item_banks",
    `id=eq.${SAMPLES_BANK}&select=org_id`,
  );
  if (!samples) throw new Error("the seeded Samples bank is missing");
  const className = `NUR 310 ${stamp}`;
  const madeClass = await makeClass(request, samples.org_id, className);

  // 1. The teacher starts it for the class from the quiz page.
  await page.goto(`/author/banks/${SAMPLES_BANK}`);
  const forClass = page.getByRole("combobox", { name: "For a class", exact: true });
  await expect(forClass).toHaveValue("");
  await expect(
    forClass.getByRole("option", { name: "No class (anyone joins)", exact: true }),
  ).toHaveCount(1);
  await forClass.selectOption({ label: className });
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  const sessionId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");

  const [session] = await selectAsAdmin<{ class_id: string | null }>(
    request,
    "sessions",
    `id=eq.${sessionId}&select=class_id`,
  );
  expect(session?.class_id).toBe(madeClass.id);

  // 2. A signed-in member of the class: told who is joining and for which class, name filled in.
  const memberName = `Mia Chen ${Date.now() % 10_000}`;
  const member = await signedInMember(browser, request, samples.org_id, madeClass.id, memberName);
  await member.page.goto(`/join/${code}`);
  await expect(
    member.page.getByText(`Joining as ${memberName} for ${className}.`, { exact: true }),
  ).toBeVisible();
  await expect(
    member.page.getByRole("link", { name: "Join as a guest instead", exact: true }),
  ).toBeVisible();
  await expect(member.page.getByRole("textbox", { name: "Display name", exact: true })).toHaveValue(
    memberName,
  );
  await member.page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(member.page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);

  // 3. A guest, signed out, in a browser of their own: today's join page, word for word.
  const guestName = `Guest ${Date.now() % 10_000}`;
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/join/${code}`);
  await expect(guest.getByText(/^Joining as /)).toHaveCount(0);
  await expect(guest.getByText("No account needed.", { exact: true })).toBeVisible();
  await guest.getByRole("textbox", { name: "Display name", exact: true }).fill(guestName);
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await expect(guest).toHaveURL(/\/play\/[0-9a-f-]{36}$/);

  // Linked and not linked, as the database holds them.
  const participants = await selectAsAdmin<{ display_name: string; profile_id: string | null }>(
    request,
    "participants",
    `session_id=eq.${sessionId}&select=display_name,profile_id&order=display_name`,
  );
  // "Guest …" sorts before "Mia …".
  expect(participants).toEqual([
    { display_name: guestName, profile_id: null },
    { display_name: memberName, profile_id: member.userId },
  ]);

  // 4. The report names both, once the session ends.
  await page.getByRole("button", { name: "End live session", exact: true }).click();
  await page.getByRole("button", { name: "End live session", exact: true }).click();
  await page.getByRole("link", { name: "Open the report", exact: true }).click();
  await expect(page.getByText(memberName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(guestName, { exact: true }).first()).toBeVisible();

  await member.page.context().close();
  await guest.context().close();
});
