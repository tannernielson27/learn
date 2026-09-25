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
import { latestSignInLink } from "./mailbox";
import { insertAsAdmin, selectAsAdmin, signInAsNewAuthor } from "./signIn";

// #241: a student practises a bank shared with their class, on a phone. A SATA answered wrong
// shows its key and rationale straight away; the next item is answered; a reload keeps both. No
// key reaches the phone for an item it has not answered, and the answer route hands back only the
// one item answered. A student of another class, and this student once the share is stopped, get
// a 404 for the page and the answer route. Needs the local Supabase stack, like
// takeAssignment.spec.ts; CI runs it in the `auth-e2e` job. Practice has no window, so nothing
// here waits on a clock.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// The seeded "Samples" bank (supabase/seed.sql), in the first org, where signInAsNewAuthor puts
// its instructor. Its items play in the order they were made: the multiple choice, then the SATA,
// then the grouping item.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";
const MC_ITEM = "00000000-0000-4000-8000-000000000100";
const SATA_ITEM = "00000000-0000-4000-8000-000000000101";

const MC_RATIONALE = "Rapid weight gain with orthopnea suggests fluid overload.";
const SATA_RATIONALE = "Tachypnea, hypoxemia, and new confusion indicate worsening gas exchange";
const GROUPING_RATIONALE = "Kussmaul respirations and acetone breath reflect metabolic acidosis";
const ANSWER_ROUTE = "/api/practice/answer";

async function expectNoAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

/** The bytes a page's own GET returns to this browser: the HTML and its inline Flight payload. */
async function bytesOf(
  context: BrowserContext,
  path: string,
): Promise<{ status: number; body: string }> {
  const response = await context.request.get(path);
  return { status: response.status(), body: await response.text() };
}

async function createClass(page: Page, name: string): Promise<{ id: string; invite: string }> {
  await page.goto("/author");
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1) as string;
  const invite = await page.getByRole("textbox", { name: "Invite link", exact: true }).inputValue();
  return { id, invite };
}

/** A student on a phone who joins a class from its invite link. */
async function joinAsStudent(
  browser: Browser,
  request: APIRequestContext,
  testInfo: TestInfo,
  invite: string,
  label: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(invite);
  const email = `student-${label}-${testInfo.project.name}-${Date.now()}@example.test`;
  const since = new Date();
  await page.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await page.goto(await latestSignInLink(request, email, since));
  await expect(page).toHaveURL(/\/learn$/);
  return { context, page };
}

function postAnswer(context: BrowserContext, body: Record<string, unknown>) {
  return context.request.post(ANSWER_ROUTE, { data: body });
}

test("a student practises a shared bank on a phone, sees each key as they answer, and keeps it on reload", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;
  const shot = (name: string) => `test-results/screenshots/${project}/${name}.png`;

  // An instructor with two classes; one student in each. The bank is shared with the first only.
  await signInAsNewAuthor(page, request, `practice-${project}`);
  const stamp = Date.now() % 100_000;
  const className = `NUR 310 ${stamp}`;
  const cardiac = await createClass(page, className);
  const other = await createClass(page, `NUR 205 ${stamp}`);
  const [klass] = await selectAsAdmin<{ org_id: string }>(
    request,
    "classes",
    `id=eq.${cardiac.id}&select=org_id`,
  );
  if (!klass) throw new Error("no class");
  await insertAsAdmin(request, "bank_practice_shares", {
    org_id: klass.org_id,
    bank_id: SAMPLES_BANK,
    class_id: cardiac.id,
  });

  const phone = await joinAsStudent(browser, request, testInfo, cardiac.invite, "practice");
  const student = phone.page;
  const practicePath = `/learn/practice/${SAMPLES_BANK}`;

  // The home lists the bank under Practice, linked.
  const list = student.getByRole("list", { name: "Practice banks", exact: true });
  await expect(list.getByRole("link", { name: "Samples", exact: true })).toBeVisible();
  await expect(list).toContainText(/\d+ items/);
  await expectNoAxeViolations(student);
  await student.screenshot({ path: shot("practice-home"), fullPage: true });

  await list.getByRole("link", { name: "Samples", exact: true }).click();
  await expect(student).toHaveURL(new RegExp(`${practicePath}$`));
  await expect(
    student.getByRole("heading", { level: 1, name: "Samples", exact: true }),
  ).toBeVisible();
  await expect(student.getByTestId("practice-count")).toHaveText(/^0 of \d+ done$/);

  // #146: the page's own bytes carry the items and no key or rationale for any of them. The
  // control: an author's page for the same item does carry the rationale.
  expect((await bytesOf(page.context(), `/author/items/${SATA_ITEM}`)).body).toContain(
    SATA_RATIONALE,
  );
  const before = await bytesOf(phone.context, practicePath);
  expect(before.status).toBe(200);
  expect(before.body).toContain("community-acquired pneumonia");
  for (const secret of [
    MC_RATIONALE,
    SATA_RATIONALE,
    GROUPING_RATIONALE,
    "correctOptionIds",
    "answerKey",
  ]) {
    expect(before.body).not.toContain(secret);
  }

  // The SATA, answered wrong: one expected finding only.
  await student.getByRole("button", { name: "Item 2, not answered", exact: true }).click();
  await student.getByRole("checkbox", { name: /Temperature 37\.2/ }).click();
  const [answerRequest, answerResponse] = await Promise.all([
    student.waitForRequest((req) => req.url().endsWith(ANSWER_ROUTE) && req.method() === "POST"),
    student.waitForResponse((res) => res.url().endsWith(ANSWER_ROUTE)),
    student.getByRole("button", { name: "Submit", exact: true }).click(),
  ]);
  expect(answerResponse.status()).toBe(200);
  const revealBytes = await answerResponse.text();
  // That item's key and rationale are in the answer: the control that the probe can see one.
  expect(revealBytes).toContain(SATA_RATIONALE);
  expect(revealBytes).toContain("correctOptionIds");
  // And no other item's.
  expect(revealBytes).not.toContain(MC_RATIONALE);
  expect(revealBytes).not.toContain(GROUPING_RATIONALE);
  const runId = (answerRequest.postDataJSON() as { runId: string }).runId;

  await expect(student.getByText(SATA_RATIONALE, { exact: false })).toBeVisible();
  await expect(student.getByRole("complementary", { name: "Score", exact: true })).toBeVisible();
  await expect(student.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);
  await expectNoAxeViolations(student);
  await student.screenshot({ path: shot("practice-sata-feedback"), fullPage: true });

  // The next item: one finding in each body system.
  await student.getByRole("button", { name: "Next item", exact: true }).click();
  await student.getByRole("checkbox", { name: /Deep, rapid respirations/ }).click();
  await student.getByRole("checkbox", { name: /Heart rate 118/ }).click();
  await student.getByRole("checkbox", { name: /Drowsiness/ }).click();
  await student.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(student.getByText(GROUPING_RATIONALE, { exact: false })).toBeVisible();
  await expect(student.getByTestId("practice-count")).toHaveText(/^2 of \d+ done$/);

  // Reload: the progress is still there, and the SATA reopens with its key.
  await student.reload();
  await expect(student.getByTestId("practice-count")).toHaveText(/^2 of \d+ done$/);
  await student.getByRole("button", { name: "Item 2, answered", exact: true }).click();
  await expect(student.getByText(SATA_RATIONALE, { exact: false })).toBeVisible();
  await expect(student.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);

  // Start over asks first, by keyboard: focus goes to Cancel, and Cancel hands it back.
  const startOver = student.getByRole("button", { name: "Start over", exact: true });
  await startOver.focus();
  await student.keyboard.press("Enter");
  await expect(student.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await expectNoAxeViolations(student);
  await student.keyboard.press("Enter");
  await expect(startOver).toBeFocused();

  // The page now carries the two answered items' rationales, and still not the unanswered one's.
  const after = await bytesOf(phone.context, practicePath);
  expect(after.body).toContain(SATA_RATIONALE);
  expect(after.body).toContain(GROUPING_RATIONALE);
  expect(after.body).not.toContain(MC_RATIONALE);

  // No route hands out an unanswered item's key: a second answer is refused, the route reads no
  // GET, and an item the run has not answered gets a key only by being answered.
  const second = await postAnswer(phone.context, {
    runId,
    itemId: SATA_ITEM,
    response: { type: "multiple_response", optionIds: ["opt_a", "opt_b", "opt_d"] },
  });
  expect(second.status()).toBe(409);
  expect(await second.text()).not.toContain(SATA_RATIONALE);
  const getKey = await phone.context.request.get(
    `${ANSWER_ROUTE}?runId=${runId}&itemId=${MC_ITEM}`,
  );
  expect(getKey.status()).toBe(405);
  expect(await getKey.text()).not.toContain(MC_RATIONALE);

  // A student of the other class: the bank and its answer route are a 404.
  const outsider = await joinAsStudent(browser, request, testInfo, other.invite, "outsider");
  await expect(
    outsider.page.getByRole("list", { name: "Practice banks", exact: true }),
  ).toHaveCount(0);
  const outsiderPage = await bytesOf(outsider.context, practicePath);
  expect(outsiderPage.status).toBe(404);
  expect(outsiderPage.body).not.toContain("community-acquired pneumonia");
  const outsiderAnswer = await postAnswer(outsider.context, {
    runId,
    itemId: MC_ITEM,
    response: { type: "multiple_choice", optionId: "opt_a" },
  });
  expect(outsiderAnswer.status()).toBe(404);
  expect(await outsiderAnswer.text()).not.toContain(MC_RATIONALE);
  await outsider.context.close();

  // Stop sharing from the class page: at once, the student's page and answer route are a 404.
  await page.goto(`/author/classes/${cardiac.id}`);
  const classPractice = page.getByRole("region", { name: "Practice", exact: true });
  await classPractice.getByRole("button", { name: "Stop sharing Samples", exact: true }).click();
  await classPractice.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await expect(
    classPractice.getByText("No bank is shared with this class for practice.", { exact: true }),
  ).toBeVisible();

  const stopped = await bytesOf(phone.context, practicePath);
  expect(stopped.status).toBe(404);
  expect(stopped.body).not.toContain(SATA_RATIONALE);
  const stoppedAnswer = await postAnswer(phone.context, {
    runId,
    itemId: MC_ITEM,
    response: { type: "multiple_choice", optionId: "opt_a" },
  });
  expect(stoppedAnswer.status()).toBe(404);
  expect(await stoppedAnswer.text()).not.toContain(MC_RATIONALE);
  await student.goto("/learn");
  await expect(
    student.getByRole("heading", { name: "Nothing is shared for practice yet", exact: true }),
  ).toBeVisible();

  await phone.context.close();
});
