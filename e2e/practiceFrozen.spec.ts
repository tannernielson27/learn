import { expect, test, type Page } from "@playwright/test";
import { bytesOf, capturedBytes, expectKeyless } from "./bytes";
import { latestSignInLink } from "./mailbox";
import { insertAsAdmin, selectAsAdmin, signInAsNewAuthor, updateAsAdmin } from "./signIn";

// #271: a practice run freezes its items when it starts. The student opens a bank of two items on
// a phone; the instructor then unpublishes the second and saves a new key and rationale over it.
// The student still gets that item, keyless until answered, and its feedback is the version they
// saw. Stopping the share still closes the run at once. Needs the local Supabase stack, like
// practice.spec.ts; CI runs it in the `auth-e2e` job. Nothing here waits on a clock.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// Copied from the seeded "Samples" items (supabase/seed.sql) into a bank of this test's own, so
// unpublishing one never touches the seed other specs play.
const SEED_MC = "00000000-0000-4000-8000-000000000100";
const SEED_SATA = "00000000-0000-4000-8000-000000000101";
const MC_RATIONALE = "Rapid weight gain with orthopnea suggests fluid overload.";
const SATA_RATIONALE = "Tachypnea, hypoxemia, and new confusion indicate worsening gas exchange";
const SATA_STEM = "community-acquired pneumonia";
const EDITED_RATIONALE = "Saved after the run started (#271)";
const RECORDED_KEY = '"correctOptionIds":["opt_a","opt_b","opt_d"]';
const EDITED_KEY = ["opt_c"];
const ANSWER_ROUTE = "/api/practice/answer";

interface ItemCopy {
  type: string;
  cjmm_step: number | null;
  tags: string[];
  content: unknown;
  answer_key: unknown;
  rationale: { general: { kind: string; value: string }; perElement?: unknown };
  scoring: unknown;
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

test("a practice run keeps an item the instructor unpublishes mid-run, with the key the student saw", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;
  const stamp = Date.now() % 100_000;

  // An instructor, a class, and a bank of two published items: a multiple choice, then a SATA.
  await signInAsNewAuthor(page, request, `freeze-${project}`);
  const klass = await createClass(page, `NUR 410 ${stamp}`);
  const [classRow] = await selectAsAdmin<{ org_id: string }>(
    request,
    "classes",
    `id=eq.${klass.id}&select=org_id`,
  );
  if (!classRow) throw new Error("no class");
  const orgId = classRow.org_id;
  const bank = await insertAsAdmin<{ id: string }>(request, "item_banks", {
    org_id: orgId,
    name: `Frozen week ${stamp}`,
  });
  const seeded = await selectAsAdmin<ItemCopy & { id: string }>(
    request,
    "items",
    `id=in.(${SEED_MC},${SEED_SATA})&select=id,type,cjmm_step,tags,content,answer_key,rationale,scoring`,
  );
  const copy = async (seedId: string, second: number): Promise<{ id: string } & ItemCopy> => {
    const source = seeded.find((row) => row.id === seedId);
    if (!source) throw new Error(`no seeded item ${seedId}`);
    return insertAsAdmin<{ id: string } & ItemCopy>(request, "items", {
      type: source.type,
      cjmm_step: source.cjmm_step,
      tags: source.tags,
      content: source.content,
      answer_key: source.answer_key,
      rationale: source.rationale,
      scoring: source.scoring,
      bank_id: bank.id,
      org_id: orgId,
      status: "published",
      version: 1,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString(),
    });
  };
  await copy(SEED_MC, 1);
  const sata = await copy(SEED_SATA, 2);
  await insertAsAdmin(request, "bank_practice_shares", {
    org_id: orgId,
    bank_id: bank.id,
    class_id: klass.id,
  });

  // A student on a phone joins and opens the bank: the run starts and records both items.
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const phone = await browser.newContext({ viewport, isMobile, hasTouch, reducedMotion: "reduce" });
  const student = await phone.newPage();
  await student.goto(klass.invite);
  const email = `student-freeze-${project}-${Date.now()}@example.test`;
  const since = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await student.goto(await latestSignInLink(request, email, since));
  await expect(student).toHaveURL(/\/learn$/);
  const practicePath = `/learn/practice/${bank.id}`;
  await student.goto(practicePath);
  await expect(student.getByTestId("practice-count")).toHaveText("0 of 2 done");

  // The instructor unpublishes the SATA and saves a new key and rationale over it.
  await updateAsAdmin(request, "items", `id=eq.${sata.id}`, {
    status: "draft",
    answer_key: { correctOptionIds: EDITED_KEY },
    rationale: {
      ...sata.rationale,
      general: { ...sata.rationale.general, value: EDITED_RATIONALE },
    },
  });

  // The run still holds it, and its page bytes carry no key or rationale of either version, nor
  // of the other unanswered item.
  const before = await bytesOf(phone, practicePath);
  expect(before).toContain(SATA_STEM);
  expectKeyless(before, [SATA_RATIONALE, EDITED_RATIONALE, MC_RATIONALE]);
  await student.reload();
  await expect(student.getByTestId("practice-count")).toHaveText("0 of 2 done");

  // Answered with the option the edited key would mark right: the reveal is the recorded version.
  await student.getByRole("button", { name: "Item 2, not answered", exact: true }).click();
  await expect(student.getByText(SATA_STEM, { exact: false })).toBeVisible();
  await student.getByRole("checkbox", { name: /Temperature 37\.2/ }).click();
  const reveal = await capturedBytes(
    student,
    (req) => req.method() === "POST" && req.url().endsWith(ANSWER_ROUTE),
    () => student.getByRole("button", { name: "Submit", exact: true }).click(),
  );
  expect(reveal.status).toBe(200);
  // The control: the same grep finds this item's recorded key and rationale.
  expect(reveal.body).toContain(SATA_RATIONALE);
  expect(reveal.body).toContain(RECORDED_KEY);
  expect(reveal.body).not.toContain(EDITED_RATIONALE);
  expect(reveal.body).not.toContain(MC_RATIONALE);
  await expect(student.getByText(SATA_RATIONALE, { exact: false })).toBeVisible();
  await expect(student.getByTestId("practice-count")).toHaveText("1 of 2 done");

  // After answering, the page carries the recorded rationale (the control for the grep above),
  // still not the edited one, and still nothing of the unanswered item.
  const after = await bytesOf(phone, practicePath);
  expect(after).toContain(SATA_RATIONALE);
  expect(after).not.toContain(EDITED_RATIONALE);
  expect(after).not.toContain(MC_RATIONALE);

  // Stopping the share closes the run at once: the page and the answer route are a 404.
  const runId = (JSON.parse(reveal.sent ?? "{}") as { runId?: string }).runId;
  expect(runId).toMatch(/^[0-9a-f-]{36}$/);
  await page.goto(`/author/classes/${klass.id}`);
  const classPractice = page.getByRole("region", { name: "Practice", exact: true });
  await classPractice
    .getByRole("button", { name: `Stop sharing Frozen week ${stamp}`, exact: true })
    .click();
  await classPractice.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await expect(
    classPractice.getByText("No bank is shared with this class for practice.", { exact: true }),
  ).toBeVisible();

  const stopped = await phone.request.get(practicePath);
  expect(stopped.status()).toBe(404);
  expect(await stopped.text()).not.toContain(SATA_RATIONALE);
  const stoppedAnswer = await phone.request.post(ANSWER_ROUTE, {
    data: {
      runId,
      itemId: sata.id,
      response: { type: "multiple_response", optionIds: ["opt_a"] },
    },
  });
  expect(stoppedAnswer.status()).toBe(404);
  expect(await stoppedAnswer.text()).not.toContain(SATA_RATIONALE);

  await phone.close();
});
