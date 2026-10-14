import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { stagedEhr } from "../src/lib/ngn/fixtures/chart-reveal";
import { bytesOf, wireText } from "./bytes";
import { latestSignInLink, openSignInLink } from "./mailbox";
import {
  accessTokenFor,
  insertAsAdmin,
  insertManyAsAdmin,
  rpcAsAdmin,
  rpcAsUser,
  selectAsAdmin,
  selectAsUser,
  signInAsNewAuthor,
} from "./signIn";
import { skipWelcomes } from "./welcome";

// #335: a case study's chart reaches a student only as far as the case has got, on the real bytes.
// The staged record (src/lib/ngn/fixtures/chart-reveal.ts) reveals the 0130 note at step 3 and the
// 0200 note at step 4; its labs tab is hidden at step 1, locked at step 2 and open from step 3. For
// each student surface, a page for an earlier step must not carry a later note or the locked tab's
// text, and the page for the step that reveals them must (the control). Needs the local Supabase
// stack with Realtime; CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const NOTE_0115 = "0115: Pain now 8/10";
const NOTE_0130 = "0130: Pale and diaphoretic";
const NOTE_0200 = "0200: Second large-bore IV";
/** The labs tab's own text: in the record, never in a view where the tab is hidden or locked. */
const LABS_TEXT = "Serum hCG";
const DISPLAY_NAME = "Chart Phone";

function expectAbsent(bytes: string, texts: readonly string[]): void {
  for (const text of texts) expect(bytes, `"${text}" should not be sent yet`).not.toContain(text);
}

function expectPresent(bytes: string, texts: readonly string[]): void {
  for (const text of texts) expect(bytes, `"${text}" should be sent now`).toContain(text);
}

/** A published multiple choice for one step of the case. Fictional content. */
function stepRow(orgId: string, bankId: string, step: number, stamp: string) {
  return {
    org_id: orgId,
    bank_id: bankId,
    type: "multiple_choice",
    cjmm_step: step,
    status: "published",
    content: {
      id: `chart_e2e_${stamp}_${step}`,
      stem: { kind: "markdown", value: `Chart step ${step}: which action comes first?` },
      meta: {},
      content: {
        options: [
          { id: "opt_a", label: `Assess the client at step ${step}` },
          { id: "opt_b", label: `Document and wait at step ${step}` },
        ],
      },
    },
    answer_key: { correctOptionId: "opt_a" },
    rationale: {},
    scoring: { model: "zero_one", maxPoints: 1 },
  };
}

interface StagedCase {
  orgId: string;
  bankId: string;
  caseId: string;
  /** Item row ids, step 1 first. */
  steps: string[];
}

/** A bank of this test's own with the staged case study in it, published, and its six steps. */
async function stagedCase(
  request: APIRequestContext,
  orgId: string,
  stamp: string,
): Promise<StagedCase> {
  const bank = await insertAsAdmin<{ id: string }>(request, "item_banks", {
    org_id: orgId,
    name: `Chart e2e ${stamp}`,
  });
  const items = await insertManyAsAdmin<{ id: string; content: { id: string } }>(
    request,
    "items",
    [1, 2, 3, 4, 5, 6].map((step) => stepRow(orgId, bank.id, step, stamp)),
  );
  const steps = [1, 2, 3, 4, 5, 6].map((step) => {
    const row = items.find((item) => item.content.id === `chart_e2e_${stamp}_${step}`);
    if (!row) throw new Error(`step ${step} was not inserted`);
    return row.id;
  });
  const study = await insertAsAdmin<{ id: string }>(request, "case_studies", {
    org_id: orgId,
    bank_id: bank.id,
    title: `Ectopic chart ${stamp}`,
    ehr: stagedEhr,
    tags: [],
    status: "published",
  });
  await insertManyAsAdmin(
    request,
    "case_study_items",
    steps.map((itemId, index) => ({
      case_study_id: study.id,
      org_id: orgId,
      bank_id: bank.id,
      position: index + 1,
      item_id: itemId,
    })),
  );
  return { orgId, bankId: bank.id, caseId: study.id, steps };
}

async function createClass(page: Page, name: string): Promise<{ id: string; invite: string }> {
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1) as string;
  const invite = await page.getByRole("textbox", { name: "Invite link", exact: true }).inputValue();
  return { id, invite };
}

async function phoneFor(browser: Browser, testInfo: TestInfo, origin: string): Promise<Page> {
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: origin,
    viewport,
    isMobile,
    hasTouch,
    reducedMotion: "reduce",
  });
  return context.newPage();
}

/** The chart, whichever of its three shapes this width draws: the chip opens it below 1024px. */
async function openChart(page: Page): Promise<void> {
  const chip = page.getByRole("button", { name: "Patient record", exact: true });
  if ((await chip.isVisible()) && (await chip.getAttribute("aria-expanded")) === "false") {
    await chip.click();
  }
}

async function closeChart(page: Page): Promise<void> {
  const chip = page.getByRole("button", { name: "Patient record", exact: true });
  if ((await chip.isVisible()) && (await chip.getAttribute("aria-expanded")) === "true") {
    await chip.click();
  }
  const sheet = page.getByRole("dialog", { name: "Patient record" });
  if (await sheet.isVisible()) await page.keyboard.press("Escape");
}

const labsTab = (page: Page) => page.getByRole("tab", { name: /^Lab Results/ });

/** The view the phone's own cookie is answered with, as it fetches it. */
async function viewBytes(phone: BrowserContext): Promise<string> {
  const response = await phone.request.post("/api/live/view", {
    headers: { "content-type": "application/json" },
    data: "{}",
  });
  expect(response.status()).toBe(200);
  return wireText(await response.text());
}

test("a live case study: the phone's chart moves with the room and nothing later is sent", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  const project = testInfo.project.name;
  const shot = (name: string) => `test-results/screenshots/${project}/${name}.png`;
  const bytesToo = project === "phone-375";

  await signInAsNewAuthor(page, request, `chart-live-${project}`);
  const origin = new URL(page.url()).origin;
  const klass = await createClass(page, `Chart live ${Date.now() % 100_000}`);
  const [classRow] = await selectAsAdmin<{ org_id: string }>(
    request,
    "classes",
    `id=eq.${klass.id}&select=org_id`,
  );
  if (!classRow) throw new Error("no class");
  const staged = await stagedCase(request, classRow.org_id, `${project}-live-${Date.now()}`);

  // The host starts the room from the case study; a phone joins it.
  await page.goto(`/author/case-studies/${staged.caseId}`);
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");
  const phone = await phoneFor(browser, testInfo, origin);
  await phone.goto(`/join/${code}`);
  await phone.getByRole("textbox", { name: "Display name", exact: true }).fill(DISPLAY_NAME);
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  const playPath = new URL(phone.url()).pathname;
  await expect(page.getByTestId("present-count")).toHaveText("1 phone connected", {
    timeout: 15_000,
  });

  // Step 1.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(phone.getByText("Chart step 1: which action comes first?")).toBeVisible({
    timeout: 15_000,
  });
  if (bytesToo) {
    const play = await bytesOf(phone.context(), playPath);
    expect(play).toContain(DISPLAY_NAME);
    expectPresent(play, [NOTE_0115]);
    expectAbsent(play, [NOTE_0130, NOTE_0200, LABS_TEXT, "fromStep", "stepAccess"]);
    const view = await viewBytes(phone.context());
    expectPresent(view, [NOTE_0115]);
    expectAbsent(view, [NOTE_0130, NOTE_0200, LABS_TEXT]);
  }
  await openChart(phone);
  await expect(labsTab(phone)).toHaveCount(0);
  await closeChart(phone);

  // Step 2: the labs tab is there, locked, and cannot be opened; its text is not on the page.
  await page.getByRole("button", { name: "Next question", exact: true }).click();
  await expect(phone.getByText("Chart step 2: which action comes first?")).toBeVisible({
    timeout: 15_000,
  });
  await openChart(phone);
  await expect(labsTab(phone)).toHaveAccessibleName("Lab Results Locked", { timeout: 15_000 });
  await expect(labsTab(phone)).toHaveAttribute("aria-disabled", "true");
  await labsTab(phone).click({ force: true });
  await expect(labsTab(phone)).toHaveAttribute("aria-selected", "false");
  await expect(phone.getByText(LABS_TEXT)).toHaveCount(0);
  await expect(phone.getByText(NOTE_0130)).toHaveCount(0);
  const axe = await new AxeBuilder({ page: phone }).analyze();
  expect(axe.violations).toEqual([]);
  await phone.screenshot({ path: shot("chart-locked-tab"), fullPage: false });
  if (bytesToo) {
    const play = await bytesOf(phone.context(), playPath);
    expectPresent(play, ["Lab Results"]);
    expectAbsent(play, [LABS_TEXT, NOTE_0130, NOTE_0200]);
  }

  // Step 3, with no reload: the 0130 note arrives and the labs tab opens.
  await page.getByRole("button", { name: "Next question", exact: true }).click();
  await expect(phone.getByText("Chart step 3: which action comes first?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(labsTab(phone)).toHaveAccessibleName("Lab Results", { timeout: 15_000 });
  await labsTab(phone).click();
  await expect(phone.getByText(LABS_TEXT).filter({ visible: true }).first()).toBeVisible();
  await phone.getByRole("tab", { name: "Nurses' Notes", exact: true }).click();
  await expect(
    phone.getByText(NOTE_0130, { exact: false }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(phone.getByText(NOTE_0200)).toHaveCount(0);
  await phone.screenshot({ path: shot("chart-opened-tab"), fullPage: false });

  // The control on the bytes: step 4's page and view carry the 0200 note and the labs.
  await closeChart(phone);
  await page.getByRole("button", { name: "Next question", exact: true }).click();
  await expect(phone.getByText("Chart step 4: which action comes first?")).toBeVisible({
    timeout: 15_000,
  });
  if (bytesToo) {
    expectPresent(await bytesOf(phone.context(), playPath), [NOTE_0200, LABS_TEXT, NOTE_0130]);
    expectPresent(await viewBytes(phone.context()), [NOTE_0200, LABS_TEXT]);
  }

  // The instructor's console shows the whole record, marked with the class's step.
  const hostRecord = page.getByTestId("host-record");
  await hostRecord.getByText("Patient record").click();
  await expect(hostRecord.getByTestId("record-note")).toContainText("The class is on step 4");

  await page.getByRole("button", { name: "End live session", exact: true }).click();
  await page.getByRole("button", { name: "End live session", exact: true }).click();
  await phone.context().close();
});

test("practice and take-home send each step's chart only once the steps before it are answered", async ({
  page,
  browser,
  request,
}, testInfo) => {
  // The bytes do not depend on the viewport.
  test.skip(testInfo.project.name !== "phone-375", "the response bytes do not depend on viewport");
  test.setTimeout(180_000);
  const project = testInfo.project.name;

  await signInAsNewAuthor(page, request, `chart-self-${project}`);
  const origin = new URL(page.url()).origin;
  const klass = await createClass(page, `Chart self ${Date.now() % 100_000}`);
  const [classRow] = await selectAsAdmin<{ org_id: string }>(
    request,
    "classes",
    `id=eq.${klass.id}&select=org_id`,
  );
  if (!classRow) throw new Error("no class");
  const staged = await stagedCase(request, classRow.org_id, `${project}-self-${Date.now()}`);
  await insertAsAdmin(request, "bank_practice_shares", {
    org_id: staged.orgId,
    bank_id: staged.bankId,
    class_id: klass.id,
  });

  // A student joins the class from the invite link.
  const student = await phoneFor(browser, testInfo, origin);
  await skipWelcomes(student);
  await student.goto(klass.invite);
  const email = `student-chart-${project}-${Date.now()}@example.test`;
  const since = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student
    .getByRole("button", { name: "Join with an emailed link instead", exact: true })
    .click();
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await openSignInLink(student, await latestSignInLink(request, email, since));
  await expect(student).toHaveURL(/\/learn$/);
  const [member] = await selectAsAdmin<{ profile_id: string }>(
    request,
    "class_members",
    `class_id=eq.${klass.id}&select=profile_id`,
  );
  if (!member) throw new Error("the student did not join");
  const studentId = member.profile_id;
  const answer = { type: "multiple_choice", optionId: "opt_a" };

  // Practice: a fresh run has reached step 1.
  const practicePath = `/learn/practice/${staged.bankId}`;
  const practiceStart = await bytesOf(student.context(), practicePath);
  expectPresent(practiceStart, [NOTE_0115, "Chart step 1: which action"]);
  expectAbsent(practiceStart, [
    NOTE_0130,
    NOTE_0200,
    LABS_TEXT,
    "Lab Results",
    "Chart step 2: which action",
    "fromStep",
    "stepAccess",
  ]);
  const [run] = await rpcAsAdmin<{ run_id: string }[]>(request, "open_practice_run", {
    student: studentId,
    target_bank: staged.bankId,
    fresh: false,
  });
  if (!run) throw new Error("no practice run");
  const practise = async (step: number) => {
    const outcome = await rpcAsAdmin<string>(request, "record_practice_response", {
      student: studentId,
      target_run: run.run_id,
      target_item: staged.steps[step - 1],
      answer,
      earned: 1,
      possible: 1,
      marks: { earned: 1, possible: 1 },
    });
    expect(outcome).toBe("recorded");
  };
  // Step 1 answered: step 2 reached, and the labs tab is named and locked, its text not sent.
  await practise(1);
  const practiceStep2 = await bytesOf(student.context(), practicePath);
  expectPresent(practiceStep2, ['"title":"Lab Results","locked":true']);
  expectAbsent(practiceStep2, [LABS_TEXT, NOTE_0130, NOTE_0200]);
  // The control: steps 1 to 3 answered, so step 4 is reached and its chart carries both.
  await practise(2);
  await practise(3);
  expectPresent(await bytesOf(student.context(), practicePath), [NOTE_0200, LABS_TEXT, NOTE_0130]);

  // Take-home: the same case assigned, an attempt started as the student.
  const token = await accessTokenFor(request, studentId, email);
  const assignment = await insertAsAdmin<{ id: string }>(request, "assignments", {
    org_id: staged.orgId,
    class_id: klass.id,
    case_study_id: staged.caseId,
    title: `Chart take-home ${project}`,
    opens_at: new Date(Date.now() - 60_000).toISOString(),
    closes_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    max_attempts: 1,
    shuffle_options: false,
  });
  const [started] = await rpcAsUser<{ refusal: string | null; attempt_id: string | null }[]>(
    request,
    token,
    "start_assignment_attempt",
    { target_assignment: assignment.id },
  );
  const attemptId = started?.attempt_id;
  if (!attemptId) throw new Error(`no attempt: ${started?.refusal}`);
  const takePath = `/learn/assignments/${assignment.id}`;
  const takeStart = await bytesOf(student.context(), takePath);
  expectPresent(takeStart, [NOTE_0115, "Chart step 1: which action"]);
  expectAbsent(takeStart, [
    NOTE_0130,
    NOTE_0200,
    LABS_TEXT,
    "Lab Results",
    "Chart step 2: which action",
    "fromStep",
    "stepAccess",
  ]);

  // The student's own client cannot read the whole record from the table either.
  const refused = await selectAsUser(
    request,
    token,
    "assignments",
    `id=eq.${assignment.id}&select=patient_record`,
  );
  expect(refused.ok()).toBe(false);
  expect(await refused.text()).not.toContain(NOTE_0200);
  // The control: the same client reads the row's other columns, and the record is in the table.
  const allowed = await selectAsUser(
    request,
    token,
    "assignments",
    `id=eq.${assignment.id}&select=title`,
  );
  expect(allowed.ok()).toBe(true);
  expect(await allowed.text()).toContain("Chart take-home");
  const [stored] = await selectAsAdmin<{ patient_record: unknown }>(
    request,
    "assignments",
    `id=eq.${assignment.id}&select=patient_record`,
  );
  expect(JSON.stringify(stored?.patient_record)).toContain(NOTE_0200);

  const save = async (step: number) => {
    const [saved] = await rpcAsUser<{ refusal: string | null }[]>(
      request,
      token,
      "save_attempt_response",
      { target_attempt: attemptId, target_item: staged.steps[step - 1], answer },
    );
    expect(saved?.refusal ?? null).toBeNull();
  };
  await save(1);
  const takeStep2 = await bytesOf(student.context(), takePath);
  expectPresent(takeStep2, ['"title":"Lab Results","locked":true', "Chart step 2: which action"]);
  expectAbsent(takeStep2, [LABS_TEXT, NOTE_0130, NOTE_0200]);
  // The control: steps 1 to 3 saved, so step 4 is reached.
  await save(2);
  await save(3);
  expectPresent(await bytesOf(student.context(), takePath), [NOTE_0200, LABS_TEXT, NOTE_0130]);

  // On screen: step 2's chart shows the labs locked; going back to step 1 shows step 1's chart.
  await student.goto(takePath);
  await student.getByRole("button", { name: "Question 2, answered", exact: true }).click();
  await openChart(student);
  await expect(labsTab(student)).toHaveAccessibleName("Lab Results Locked");
  await closeChart(student);
  await student.getByRole("button", { name: "Previous", exact: true }).click();
  await openChart(student);
  await expect(labsTab(student)).toHaveCount(0);

  await student.context().close();
});
