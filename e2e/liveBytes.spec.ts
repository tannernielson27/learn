import {
  expect,
  test,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { LIVE_KEY_MARKERS, bytesOf, capturedBytes, expectKeyless, wireText } from "./bytes";
import { signInAsNewAuthor } from "./signIn";

// #244: what a phone in a live room is handed, on the bytes the built app serves, before and after
// the reveal. The handler-level tests (supabaseRoom, pacedWire, caseStudyWire) prove the logic
// against a fake database; this proves the routes as deployed: `/join/[code]`, the `/play` page's
// HTML and inline Flight, and the JSON of `POST /api/live/view` and `/api/live/submit`. The control
// is the same view route after the reveal, which does carry the key and the rationale.
//
// No authoring and no real-time wait: the new instructor is in the seeded org, so the seeded
// "Samples" bank and case study are there to start. Needs the local Supabase stack with Realtime;
// CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// supabase/seed.sql. A bank's live set is ordered by creation, then id, and the seed writes every
// item in one statement, so the MC (…100) is item 1 and the SATA (…101) item 2.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";
const SAMPLE_CASE_STUDY = "00000000-0000-4000-8000-000000000003";
const MC_STEM = /gaining 2\.3 kg/;
const SATA_STEM = /community-acquired pneumonia/;
const SATA_RATIONALE = "Tachypnea, hypoxemia, and new confusion indicate worsening gas exchange";
const MC_RATIONALE = "Rapid weight gain with orthopnea suggests fluid overload.";
const CASE_STEP_1_STEM = /^Click to highlight the findings in the 1400 nurses/;
const CASE_STEP_1_RATIONALE =
  "Acute dyspnea, pleuritic pain, hypoxemia, and a unilateral swollen calf together point to a venous thromboembolic event.";
const DISPLAY_NAME = "Ada Brennan";

const JSON_HEADERS = { "content-type": "application/json" };

/** The body of this phone's `POST /api/live/view`, sent the way the phone sends it. */
async function viewBytes(phone: BrowserContext): Promise<string> {
  const response = await phone.request.post("/api/live/view", {
    headers: JSON_HEADERS,
    data: "{}",
  });
  expect(response.status()).toBe(200);
  return wireText(await response.text());
}

/** Starts a live session from an author page and returns its join code. */
async function startRoom(host: Page, path: string): Promise<string> {
  await host.goto(path);
  await host.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(host).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  return (await host.getByTestId("join-code").innerText()).replace(/\s/g, "");
}

/** The phone opens the code's join page, checks its bytes, and joins. Returns the /play path. */
async function joinRoom(phone: Page, code: string): Promise<string> {
  const joinPage = await bytesOf(phone.context(), `/join/${code}`);
  // The control: the page is the one for this code, filled in. The negative: nothing else.
  expect(joinPage).toContain(code);
  expectKeyless(joinPage, [SATA_RATIONALE, MC_RATIONALE, CASE_STEP_1_RATIONALE], LIVE_KEY_MARKERS);
  await phone.goto(`/join/${code}`);
  await phone.getByRole("textbox", { name: "Display name", exact: true }).fill(DISPLAY_NAME);
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  return new URL(phone.url()).pathname;
}

async function phoneFor(browser: Browser, origin: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  return context.newPage();
}

function isSubmit(method: string, url: string): boolean {
  return method === "POST" && new URL(url).pathname === "/api/live/submit";
}

async function expectRefused(response: APIResponse): Promise<string> {
  expect(response.ok()).toBe(false);
  const body = wireText(await response.text());
  expect(body).toContain('"refusal"');
  return body;
}

test("a live SATA and a case-study step reach the phone keyless until the reveal", async ({
  browser,
  page,
  request,
}, testInfo) => {
  // The bytes are the same whatever the screen, so one project runs it: the phone the rule is for.
  test.skip(testInfo.project.name !== "phone-375", "the response bytes do not depend on viewport");
  // Two rooms, one phone, no real-time wait.
  test.slow();
  await signInAsNewAuthor(page, request, "live-bytes");
  const origin = new URL(page.url()).origin;

  // A SATA from a bank, instructor-paced.
  const code = await startRoom(page, `/author/banks/${SAMPLES_BANK}`);
  const phone = await phoneFor(browser, origin);
  const context = phone.context();
  const playPath = await joinRoom(phone, code);
  await expect(page.getByTestId("present-count")).toHaveText("1 phone connected", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(phone.getByText(MC_STEM)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Next item", exact: true }).click();
  await expect(phone.getByText(SATA_STEM)).toBeVisible({ timeout: 15_000 });

  // Before the reveal: the page, the view, and the phone's own submit carry no key or mark.
  const play = await bytesOf(context, playPath);
  expect(play).toContain(DISPLAY_NAME);
  expectKeyless(play, [SATA_RATIONALE, MC_RATIONALE], LIVE_KEY_MARKERS);
  const before = await viewBytes(context);
  expect(before).toMatch(SATA_STEM);
  expectKeyless(before, [SATA_RATIONALE], LIVE_KEY_MARKERS);

  await phone.getByRole("checkbox", { name: /Respiratory rate 28 breaths/ }).click();
  await phone.getByRole("checkbox", { name: /Oxygen saturation 89%/ }).click();
  const submitted = await capturedBytes(
    phone,
    (sent) => isSubmit(sent.method(), sent.url()),
    () => phone.getByRole("button", { name: "Submit", exact: true }).click(),
  );
  await expect(phone.getByTestId("answer-sent")).toBeVisible();
  expect(submitted.status).toBe(200);
  expectKeyless(submitted.body, [SATA_RATIONALE], LIVE_KEY_MARKERS);
  expect(submitted.sent).not.toBeNull();

  // The reveal, and the control: the same route now carries the key, the rationale and the mark.
  await page.getByRole("button", { name: "Show answer", exact: true }).click();
  await expect(phone.getByRole("complementary", { name: "Score", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  const after = await viewBytes(context);
  expect(after).toContain(SATA_RATIONALE);
  expect(after).toContain('"answerKey"');
  expect(after).toContain('"correctOptionIds"');
  expect(after).toContain('"points"');
  // A late submit after the reveal is refused, and the refusal is only a refusal.
  const late = await expectRefused(
    await context.request.post("/api/live/submit", {
      headers: JSON_HEADERS,
      data: submitted.sent ?? "{}",
    }),
  );
  expectKeyless(late, [SATA_RATIONALE], LIVE_KEY_MARKERS);
  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(phone.getByText("This session has ended.")).toBeVisible({ timeout: 15_000 });

  // Step 1 of the seeded case study, on the same phone, which joining replaces the room of.
  const caseCode = await startRoom(page, `/author/case-studies/${SAMPLE_CASE_STUDY}`);
  const casePlay = await joinRoom(phone, caseCode);
  await expect(page.getByTestId("present-count")).toHaveText("1 phone connected", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(phone.getByText(CASE_STEP_1_STEM)).toBeVisible({ timeout: 15_000 });

  // The page carries the patient record, which is not answer-bearing, and no step's key.
  const casePage = await bytesOf(context, casePlay);
  expect(casePage).toContain("Orthopedic unit");
  expectKeyless(casePage, [CASE_STEP_1_RATIONALE], LIVE_KEY_MARKERS);
  const stepBefore = await viewBytes(context);
  expect(stepBefore).toContain("Click to highlight the findings in the 1400 nurses");
  expectKeyless(stepBefore, [CASE_STEP_1_RATIONALE], LIVE_KEY_MARKERS);

  // The control: after the reveal, the step's key and rationale, to a phone that did not answer.
  await page.getByRole("button", { name: "Show answer", exact: true }).click();
  await expect(phone.getByTestId("not-answered")).toBeVisible({ timeout: 15_000 });
  const stepAfter = await viewBytes(context);
  expect(stepAfter).toContain(CASE_STEP_1_RATIONALE);
  expect(stepAfter).toContain('"answerKey"');

  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(phone.getByText("This session has ended.")).toBeVisible({ timeout: 15_000 });
  await context.close();
});
