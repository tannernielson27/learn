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

// A student sees their own live session results (20261025000000_student_live_results.sql). A
// teacher starts a live session for a class; a signed-in member joins and answers question 1. While
// the session runs, the student's home lists nothing and the results page is not found. Once it
// ends, the home lists it with the score and its page shows the answer with the rationale. Another
// member of the same class gets not-found. Needs the local Supabase stack; CI runs it in the
// `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// supabase/seed.sql: the "Samples" quiz plays its multiple choice question first.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";
const MC_ITEM = "00000000-0000-4000-8000-000000000100";
const MC_RATIONALE = "Rapid weight gain with orthopnea suggests fluid overload.";
const CLASS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

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
  const email = uniqueEmail("student-live-results");
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

const liveSessions = (page: Page) =>
  page.getByRole("region", { name: "Live sessions", exact: true });

test("a student sees their own live session results once it ends, and nobody else can", async ({
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
  const madeClass = await makeClass(request, samples.org_id, `NUR 310 ${stamp}`);

  // The teacher starts it for the class.
  await page.goto(`/author/banks/${SAMPLES_BANK}`);
  await page
    .getByRole("combobox", { name: "For a class", exact: true })
    .selectOption({ label: `NUR 310 ${stamp}` });
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  const sessionId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");
  const [session] = await selectAsAdmin<{ title: string; org_id: string }>(
    request,
    "sessions",
    `id=eq.${sessionId}&select=title,org_id`,
  );
  if (!session) throw new Error("the session is missing");

  // A member joins, signed in, and is linked; another member of the class does not join.
  const name = `Mia Chen ${Date.now() % 10_000}`;
  const member = await signedInMember(browser, request, samples.org_id, madeClass.id, name);
  const other = await signedInMember(browser, request, samples.org_id, madeClass.id, "Omar Ali");
  await member.page.goto(`/join/${code}`);
  await member.page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(member.page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  const [participant] = await selectAsAdmin<{ id: string }>(
    request,
    "participants",
    `session_id=eq.${sessionId}&profile_id=eq.${member.userId}&select=id`,
  );
  if (!participant) throw new Error("the member was not linked");

  // The room moves to question 1, and the member's answer is recorded as the submit route records
  // it: right, one point of one.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const [mc] = await selectAsAdmin<{ answer_key: { correctOptionId: string } }>(
    request,
    "items",
    `id=eq.${MC_ITEM}&select=answer_key`,
  );
  if (!mc) throw new Error("the seeded question is missing");
  await insertAsAdmin(request, "session_responses", {
    session_id: sessionId,
    org_id: session.org_id,
    participant_id: participant.id,
    item_id: MC_ITEM,
    item_position: 1,
    response: { type: "multiple_choice", optionId: mc.answer_key.correctOptionId },
    points: 1,
    max_points: 1,
    model: "zero_one",
    breakdown: [],
  });

  // Still running: nothing listed, and its results page is not found.
  await member.page.goto("/learn");
  await expect(
    liveSessions(member.page).getByRole("heading", { name: "No live sessions yet", exact: true }),
  ).toBeVisible();
  expect((await member.page.goto(`/learn/live/${sessionId}`))?.status()).toBe(404);

  // The teacher ends it.
  await page.getByRole("button", { name: "End live session", exact: true }).click();
  await page.getByRole("button", { name: "End live session", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open the report", exact: true })).toBeVisible();

  // Now it is listed on the member's home with their score, and its page shows the rationale.
  await member.page.goto("/learn");
  const results = liveSessions(member.page).getByRole("link", {
    name: `Results for ${session.title}`,
    exact: true,
  });
  await expect(results).toBeVisible();
  await expect(liveSessions(member.page).getByTestId("live-history-score")).toHaveText(
    "Score 1 of 1 (100%)",
  );
  await results.click();
  await expect(member.page).toHaveURL(new RegExp(`/learn/live/${sessionId}$`));
  await expect(
    member.page.getByRole("heading", { level: 1, name: session.title, exact: true }),
  ).toBeVisible();
  await expect(member.page.getByText(MC_RATIONALE, { exact: true }).first()).toBeVisible();

  // Another member of the same class, signed in: not found, and nothing on their home.
  expect((await other.page.goto(`/learn/live/${sessionId}`))?.status()).toBe(404);
  await other.page.goto("/learn");
  await expect(
    liveSessions(other.page).getByRole("heading", { name: "No live sessions yet", exact: true }),
  ).toBeVisible();

  await member.page.context().close();
  await other.page.context().close();
});
