import { randomBytes } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import { LIVE_KEY_MARKERS, bytesOf, capturedBytes, expectKeyless, wireText } from "./bytes";
import { latestSignInLink, openSignInLink } from "./mailbox";
import { seedQuiz } from "./seedQuiz";
import {
  createAccountWithoutRole,
  insertAsAdmin,
  selectAsAdmin,
  signInAsInstructorInEmptyOrg,
  uniqueEmail,
  updateAsAdmin,
} from "./signIn";
import { skipWelcomes } from "./welcome";

// Class day, end to end (owner's live session for about 70 students on phones, 2026-10-27): a
// teacher starts a live session of a short quiz for their class, a signed-in member of the class
// and a guest join on phones, a timed question runs out, a second ends early because everyone
// answered, the teacher pauses and resumes the room, the projector holds a long question with six
// options at 1280x720, the answer is shown, the session ends on the podium, and afterwards the
// class's Progress tab and the member's own home have the session while the guest is nowhere.
// Throughout, neither phone is handed a key, a mark or a rationale before the answer is shown;
// the control is the same route after the reveal. Needs the local Supabase stack with Realtime;
// CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const CLASS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** The phone-375 project's screen, for every phone in the room. */
const PHONE: BrowserContextOptions = {
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
};

const JSON_HEADERS = { "content-type": "application/json" };

// Question 1: short, timed, and left to run out.
const Q1_STEM = "Class day timer question: which action should the nurse take first?";
const Q1_RATIONALE = "Class day rationale one: assessment of airway and breathing comes first.";
// Question 2: a long stem and six options, for the projector at 1280x720.
const Q2_STEM_START = "Class day long question.";
const Q2_STEM = [
  Q2_STEM_START,
  "A 68-year-old client is admitted to the medical-surgical unit from the emergency department",
  "with community-acquired pneumonia. The client has a history of heart failure with reduced",
  "ejection fraction, type 2 diabetes managed with oral agents, chronic kidney disease stage 3,",
  "and a 40 pack-year smoking history. On arrival the client is restless and short of breath",
  "at rest. Vital signs: temperature 38.9 C (102 F), heart rate 118 beats per",
  "minute and irregular, respiratory rate 30 breaths per minute, blood pressure 96/58 mm Hg, and",
  "oxygen saturation 86% on 2 L/min by nasal cannula. Crackles are heard bilaterally to the",
  "midscapular level, there is pitting edema of both ankles, and the spouse of the client reports",
  "new confusion since this morning. Laboratory results show a white blood cell count of",
  "18,500/mm3, lactate 3.4 mmol/L, and blood glucose 248 mg/dL. Which action should the nurse",
  "take first?",
].join(" ");
const Q2_OPTIONS = [
  { id: "opt_a", label: "Obtain a set of blood cultures before the first antibiotic dose" },
  { id: "opt_b", label: "Administer the prescribed furosemide by intravenous push" },
  { id: "opt_c", label: "Raise the head of the bed and increase the oxygen as prescribed" },
  { id: "opt_d", label: "Recheck the blood glucose with a point-of-care meter" },
  { id: "opt_e", label: "Notify the provider about the elevated lactate level" },
  { id: "opt_f", label: "Reorient the client and explain each procedure slowly" },
] as const;
const Q2_CORRECT = "opt_c";
const Q2_WRONG = "opt_d";
const Q2_RATIONALE = "Class day rationale two: oxygenation is the immediate threat to life.";

function labelOf(id: string): string {
  const option = Q2_OPTIONS.find((each) => each.id === id);
  if (!option) throw new Error(`no option ${id}`);
  return option.label;
}

const RATIONALES = [Q1_RATIONALE, Q2_RATIONALE] as const;

/** The quiz as learn.v1: two published multiple choice questions, in this order. */
function quizJson(): string {
  const base = FIXTURES.multiple_choice.canonical;
  const first = {
    ...base,
    id: "class-day-1",
    stem: { kind: "markdown", value: Q1_STEM },
    rationale: { general: { kind: "markdown", value: Q1_RATIONALE } },
  };
  const second = {
    ...base,
    id: "class-day-2",
    stem: { kind: "markdown", value: Q2_STEM },
    content: { options: Q2_OPTIONS.map((option) => ({ ...option })) },
    answerKey: { correctOptionId: Q2_CORRECT },
    rationale: { general: { kind: "markdown", value: Q2_RATIONALE } },
  };
  return JSON.stringify({ format: "learn.v1", items: [first, second] });
}

/** A class written with the local secret key, as classLiveSession.spec.ts writes one. */
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

/** A student of `orgId` on the class's roster, signed in on a phone of their own. */
async function signedInMember(
  browser: Browser,
  request: APIRequestContext,
  origin: string,
  orgId: string,
  classId: string,
  name: string,
): Promise<{ page: Page; userId: string }> {
  const email = uniqueEmail("class-day-member");
  const userId = await createAccountWithoutRole(request, email);
  await updateAsAdmin(request, "profiles", `id=eq.${userId}`, {
    org_id: orgId,
    role: "student",
    display_name: name,
  });
  await insertAsAdmin(request, "class_members", { class_id: classId, profile_id: userId });

  const page = await (await browser.newContext({ ...PHONE, baseURL: origin })).newPage();
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

/** The body of this phone's `POST /api/live/view`, sent the way the phone sends it. */
async function viewBytes(phone: BrowserContext): Promise<string> {
  const response = await phone.request.post("/api/live/view", {
    headers: JSON_HEADERS,
    data: "{}",
  });
  expect(response.status()).toBe(200);
  return wireText(await response.text());
}

/**
 * What a phone is handed while a question is up and its answer is not showing: the `/play` page
 * and the view route carry the question (the control that the grep reads the right bytes) and no
 * key, mark or rationale of any question in the quiz.
 */
async function expectPhoneKeyless(phone: Page, playPath: string, stem: string): Promise<void> {
  const context = phone.context();
  const play = await bytesOf(context, playPath);
  expectKeyless(play, RATIONALES, LIVE_KEY_MARKERS);
  const view = await viewBytes(context);
  expect(view).toContain(stem);
  expectKeyless(view, RATIONALES, LIVE_KEY_MARKERS);
}

/** Submits the phone's answer and checks the submit route's own response is keyless. */
async function submitKeyless(phone: Page): Promise<void> {
  const submitted = await capturedBytes(
    phone,
    (sent) => sent.method() === "POST" && new URL(sent.url()).pathname === "/api/live/submit",
    () => phone.getByRole("button", { name: "Submit", exact: true }).click(),
  );
  expect(submitted.status).toBe(200);
  expectKeyless(submitted.body, RATIONALES, LIVE_KEY_MARKERS);
  await expect(phone.getByTestId("answer-sent")).toBeVisible();
}

/** Every box is wholly inside a 1280x720 stage, and tall enough to hold a line of text. */
function expectOnStage(box: { x: number; y: number; width: number; height: number } | null) {
  expect(box).not.toBeNull();
  if (box === null) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1280);
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  expect(box.height).toBeGreaterThanOrEqual(24);
}

test("class day: a timed live session for a class, on phones and the projector, then progress and results", async ({
  browser,
  page,
  request,
}, testInfo) => {
  // The teacher's control view and the projector are desktop screens; the phones are 375px
  // contexts of their own, as in liveBytes.spec.ts. One project runs the whole room.
  test.skip(
    testInfo.project.name !== "desktop-1280",
    "one room: desktop teacher and projector, 375px phones",
  );
  // One question waits out a real 30 seconds on the server's clock.
  test.setTimeout(300_000);
  const stamp = `${Date.now() % 1_000_000}`;

  // 1. A teacher alone in a workspace, with a class and a short published quiz.
  const orgId = await signInAsInstructorInEmptyOrg(page, request, `class-day-${stamp}`);
  const origin = new URL(page.url()).origin;
  const quizName = `Class day ${stamp}`;
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name", exact: true }).fill(quizName);
  await page.getByRole("button", { name: "Create quiz", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: quizName, exact: true })).toBeVisible();
  const quizId = new URL(page.url()).pathname.split("/").at(-1) as string;
  await seedQuiz(page, request, quizJson());
  await updateAsAdmin(request, "items", `bank_id=eq.${quizId}`, { status: "published" });

  const className = `NUR 340 ${stamp}`;
  const madeClass = await makeClass(request, orgId, className);
  const memberName = `Mia Chen ${stamp}`;
  const guestName = `Guest Rider ${stamp}`;
  const member = await signedInMember(browser, request, origin, orgId, madeClass.id, memberName);

  // ...and starts a live session of it for that class.
  await page.goto(`/author/banks/${quizId}`);
  await page
    .getByRole("combobox", { name: "For a class", exact: true })
    .selectOption({ label: className });
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  const sessionId = new URL(page.url()).pathname.split("/").at(-1) as string;
  const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");
  const [session] = await selectAsAdmin<{ class_id: string | null; title: string }>(
    request,
    "sessions",
    `id=eq.${sessionId}&select=class_id,title`,
  );
  expect(session?.class_id).toBe(madeClass.id);
  const title = session?.title ?? "";

  // 2. The class member joins signed in, told so; a guest joins with a code and a name.
  const joinBytes = await bytesOf(member.page.context(), `/join/${code}`);
  expect(joinBytes).toContain(code);
  expectKeyless(joinBytes, RATIONALES, LIVE_KEY_MARKERS);
  await member.page.goto(`/join/${code}`);
  await expect(
    member.page.getByText(`Joining as ${memberName} for ${className}.`, { exact: true }),
  ).toBeVisible();
  await member.page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(member.page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  const playPath = new URL(member.page.url()).pathname;

  const guest = await (await browser.newContext({ ...PHONE, baseURL: origin })).newPage();
  const guestJoin = await bytesOf(guest.context(), `/join/${code}`);
  expect(guestJoin).toContain(code);
  expectKeyless(guestJoin, RATIONALES, LIVE_KEY_MARKERS);
  await guest.goto(`/join/${code}`);
  await expect(guest.getByText("No account needed.", { exact: true })).toBeVisible();
  await guest.getByRole("textbox", { name: "Display name", exact: true }).fill(guestName);
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await expect(guest).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  const phones = [member.page, guest] as const;

  await expect(page.getByTestId("present-count")).toHaveText("2 phones connected", {
    timeout: 15_000,
  });
  for (const phone of phones) {
    await expect(
      phone.getByText("You are in. Wait for your teacher to start.", { exact: true }),
    ).toBeVisible();
  }

  // 3a. Thirty seconds a question, chosen in the lobby; question 1 is left to run out.
  const perItem = page.getByRole("combobox", { name: "Time per question", exact: true });
  await perItem.selectOption({ label: "30 seconds" });
  await expect(perItem).toHaveValue("30");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (const phone of phones) {
    await expect(phone.getByText(Q1_STEM, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(phone.getByRole("timer")).toHaveText(/^0:(2\d|30)$/, { timeout: 15_000 });
  }
  // 9. Before the reveal: no key, mark or rationale on either phone, for this question or the next.
  await expectPhoneKeyless(member.page, playPath, Q1_STEM);
  await expectPhoneKeyless(guest, new URL(guest.url()).pathname, Q1_STEM);
  // Two minutes from question 2 on, so its early end below is plainly early.
  await perItem.selectOption({ label: "2 minutes" });
  await expect(perItem).toHaveValue("120");

  // Past zero and the grace: the time-up state, and Submit can no longer be pressed. The phone
  // keeps the bar where Submit was, greyed and saying why (StudentRoom's HeldSubmit, #482), so
  // "gone" is asserted as no Submit that can be pressed.
  for (const phone of phones) {
    await expect(phone.getByTestId("countdown-state")).toHaveText("Time is up", {
      timeout: 45_000,
    });
    await expect(
      phone.getByRole("status").filter({ hasText: "Time is up. Wait for the answer." }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(phone.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
  }
  await expect(page.getByTestId("answer-count")).toHaveText("0 of 2 answered", {
    timeout: 15_000,
  });

  // 6. Show the answer; then the control for question 1: the same route now carries its key.
  await page.getByRole("button", { name: "Show answer", exact: true }).click();
  for (const phone of phones) {
    await expect(phone.getByTestId("not-answered")).toBeVisible({ timeout: 15_000 });
  }
  const q1After = await viewBytes(guest.context());
  expect(q1After).toContain(Q1_RATIONALE);
  expect(q1After).toContain('"answerKey"');
  expect(q1After).not.toContain(Q2_RATIONALE);

  await page.getByRole("button", { name: "Next question", exact: true }).click();
  for (const phone of phones) {
    await expect(phone.getByText(Q2_STEM, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(phone.getByRole("timer")).toHaveText(/^(2:00|1:\d\d)$/, { timeout: 15_000 });
  }
  await expectPhoneKeyless(member.page, playPath, Q2_STEM_START);
  await expectPhoneKeyless(guest, new URL(guest.url()).pathname, Q2_STEM_START);

  // 5. The projector, in a window of its own at 1280x720, on the long question with six options.
  const stage = await page.context().newPage();
  await stage.setViewportSize({ width: 1280, height: 720 });
  const projectorPath = `/live/${sessionId}?view=projector`;
  const projectorBytes = await bytesOf(page.context(), projectorPath);
  expect(projectorBytes).toContain("data-stage");
  expectKeyless(projectorBytes, RATIONALES, LIVE_KEY_MARKERS);
  await stage.goto(projectorPath);
  const choices = stage.getByRole("list", { name: "Choices", exact: true });
  await expect(choices.getByRole("listitem")).toHaveCount(6, { timeout: 15_000 });
  await stage.evaluate(() => document.fonts.ready);
  for (const option of Q2_OPTIONS) {
    const row = choices.getByRole("listitem").filter({ hasText: option.label });
    await expect(row).toBeVisible();
    expectOnStage(await row.boundingBox());
  }
  // The clock stays on the wall below the question.
  expectOnStage(await stage.getByTestId("countdown").boundingBox());
  // The stem either fits, its last words on the wall, or is fitted and cut with its fade; under
  // reduced motion a cut stem holds at the top and says the whole question is on every phone.
  const stem = stage.getByTestId("stage-stem-region");
  expectOnStage(await stem.boundingBox());
  if ((await stage.getByTestId("stage-stem-fade-bottom").count()) > 0) {
    await expect(stage.getByText("Full question on your phone.", { exact: true })).toBeVisible();
  } else {
    await expect(stem).toContainText("Which action should the nurse take first?");
  }
  await stage.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/class-day-stage-long.png`,
  });

  // 4. Each phone picks an answer; then the teacher pauses the room (the console's lock for every
  // phone) and resumes it, and each phone has its question back with its pick still in it.
  const memberPick = member.page.getByRole("radio", { name: labelOf(Q2_CORRECT), exact: true });
  const guestPick = guest.getByRole("radio", { name: labelOf(Q2_WRONG), exact: true });
  await memberPick.click();
  await expect(memberPick).toBeChecked();
  await guestPick.click();
  await expect(guestPick).toBeChecked();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  for (const phone of phones) {
    await expect(
      phone.getByRole("heading", { name: "The live session is paused.", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(phone.getByRole("radiogroup", { name: "Options", exact: true })).toHaveCount(0);
    await expect(phone.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  for (const phone of phones) {
    await expect(phone.getByRole("radiogroup", { name: "Options", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      phone.getByRole("heading", { name: "The live session is paused.", exact: true }),
    ).toHaveCount(0);
    await expect(phone.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
  }
  await expect(memberPick).toBeChecked();
  await expect(guestPick).toBeChecked();

  // 3b. Everyone present answers, and the timer ends early by itself.
  await submitKeyless(member.page);
  await submitKeyless(guest);
  await expect(page.getByTestId("answer-count")).toHaveText("2 of 2 answered", {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Everyone answered. Timer ended." }),
  ).toBeVisible({ timeout: 20_000 });
  for (const phone of [...phones, stage]) {
    await expect(phone.getByTestId("countdown")).toHaveCount(0, { timeout: 15_000 });
  }
  // Still before the reveal, after both answers: nothing keyed yet.
  await expectPhoneKeyless(guest, new URL(guest.url()).pathname, Q2_STEM_START);

  // 6. The reveal, and its control: now the view route carries question 2's key and rationale.
  await page.getByRole("button", { name: "Show answer", exact: true }).click();
  for (const phone of phones) {
    await expect(phone.getByRole("complementary", { name: "Score", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(phone.getByText(Q2_RATIONALE, { exact: true }).first()).toBeVisible();
  }
  const q2After = await viewBytes(member.page.context());
  expect(q2After).toContain(Q2_RATIONALE);
  expect(q2After).toContain('"answerKey"');
  expect(q2After).toContain('"correctOptionId"');
  expect(q2After).toContain('"points"');

  // The last question is showing, so ending is the next move. It asks first.
  await page.getByRole("button", { name: "End live session", exact: true }).click();
  await page.getByRole("button", { name: "End live session", exact: true }).click();
  for (const phone of phones) {
    await expect(phone.getByText("This live session has ended.")).toBeVisible({ timeout: 15_000 });
  }
  // The podium on the projector: the member answered right, so they are on it.
  await expect(stage.getByRole("heading", { level: 1, name: "Top 5", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    stage.getByRole("list", { name: "Top 5", exact: true }).getByTestId("podium-name"),
  ).toContainText([memberName]);
  await stage.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/class-day-podium.png`,
  });
  await stage.close();

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

  // 7. The class's Progress tab: the member attended and scored; the guest is nowhere on it.
  // By the report's arithmetic only question 2 was answered by anyone, so it is all that counts.
  await page.goto(`/author/classes/${madeClass.id}?tab=progress`);
  const grid = page.getByRole("region", { name: "Progress by student", exact: true });
  const memberRow = grid.getByRole("row", { name: new RegExp(memberName) });
  await expect(memberRow.getByRole("cell").nth(1)).toHaveText("1 of 1");
  await expect(memberRow.getByTestId("progress-cell")).toHaveText("100%");
  await expect(page.getByText(guestName)).toHaveCount(0);
  expect(await page.content()).not.toContain(guestName);

  // 8. The member's own home lists the session with their score, and its page has the rationale.
  // Counted their way: every question the session put to the room, so question 1 counts as 0.
  await member.page.goto("/learn");
  const liveSessions = member.page.getByRole("region", { name: "Live sessions", exact: true });
  const results = liveSessions.getByRole("link", { name: `Results for ${title}`, exact: true });
  await expect(results).toBeVisible();
  await expect(liveSessions.getByTestId("live-history-score")).toHaveText("Score 1 of 2 (50%)");
  await results.click();
  await expect(member.page).toHaveURL(new RegExp(`/learn/live/${sessionId}$`));
  await expect(
    member.page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toBeVisible();
  await expect(member.page.getByText(Q2_RATIONALE, { exact: true }).first()).toBeVisible();

  // The guest has no account, so no home and no results: both send them to sign in.
  await guest.goto("/learn");
  await expect(guest).toHaveURL(/\/sign-in/);
  await guest.goto(`/learn/live/${sessionId}`);
  await expect(guest).toHaveURL(/\/sign-in/);
  await expect(guest.getByText(title, { exact: true })).toHaveCount(0);

  await member.page.context().close();
  await guest.context().close();
});
