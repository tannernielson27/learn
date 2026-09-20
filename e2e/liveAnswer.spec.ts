import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fillMultipleResponse, publishOpenItem } from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like liveSession.spec.ts. CI runs it in the `auth-e2e` job,
// which also starts Realtime: every move below reaches the phones over a channel.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

const STEM = "Which findings require immediate follow-up?";
const OPTIONS = [
  "Respiratory rate 28 breaths per minute",
  "Oxygen saturation 89 percent on room air",
  "Temperature 37.2 degrees Celsius",
  "New confusion per family",
];
/** A select-all-that-apply key: the first two are right, the last two are not. */
const CORRECT = [0, 1];
const RATIONALE = "Why the answer is right.";

/** Joins the open session as `name` and lands on the play page. */
async function join(host: Page, name: string): Promise<Page> {
  const code = (await host.getByTestId("join-code").innerText()).replace(/\s/g, "");
  const phone = await host.context().newPage();
  await phone.goto(`/join/${code}`);
  await phone.getByRole("textbox", { name: "Display name" }).fill(name);
  // Exact: "Join" is a substring of nothing else here today, and has bitten this repo twice.
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  return phone;
}

/** Selects the key's options and submits, leaving the phone in the sent state. */
async function answer(phone: Page, picks: number[]) {
  for (const index of picks) {
    await phone.getByRole("checkbox", { name: OPTIONS[index] as string }).click();
  }
  await phone.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(phone.getByTestId("answer-sent")).toBeVisible();
}

/**
 * Sprint 7's demo, end to end: three phones join a room from the code, answer the same SATA, the
 * host watches the count fill, and the reveal puts the key and the rationale on every phone.
 *
 * It is also the regression test for the seam #129 and #131 left open. Answering at all is only
 * possible because `/api/live/submit` now accepts the same httpOnly cookie the join set; if the
 * two identity schemes ever drift apart again, the first submit below is what fails.
 */
test("three phones answer a live SATA, and the reveal shows the key on all of them", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, a bank, a published item, a session and three phones through a whole round.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);

  const bankName = `Answer ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Extended Multiple Response", exact: true }).click();
  // Four blank option fields, every label required: filling fewer leaves the item invalid and
  // publishOpenItem refuses (the thing that failed CI on #128).
  await fillMultipleResponse(page, STEM, OPTIONS, CORRECT);
  await publishOpenItem(page);
  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);

  const phones = [await join(page, "Ada Brennan"), await join(page, "Bo Ntuli")];
  const third = await join(page, "Chidi Okeke");
  phones.push(third);
  await expect(page.getByTestId("present-count")).toHaveText("3 phones connected", {
    timeout: 15_000,
  });

  // Nothing to answer yet, and nothing to count.
  await expect(page.getByTestId("answer-count")).toHaveCount(0);
  for (const phone of phones) await expect(phone.getByText("You are in.")).toBeVisible();

  await page.getByRole("button", { name: "Start session", exact: true }).click();

  // The item reaches every phone over the channel, with no reload and no key on it.
  for (const phone of phones) {
    await expect(phone.getByText(STEM)).toBeVisible({ timeout: 15_000 });
    await expect(phone.getByRole("checkbox", { name: OPTIONS[0] as string })).toBeVisible();
    await expect(phone.getByText(RATIONALE)).toHaveCount(0);
  }
  await expectNoAxeViolations(phones[0] as Page);

  // Two right, one partly right: the room is not a single answer.
  await answer(phones[0] as Page, CORRECT);
  await answer(phones[1] as Page, CORRECT);
  await answer(phones[2] as Page, [0, 2]);

  // The count the host watches before deciding to reveal. It is polled, not pushed (ADR 0002).
  await expect(page.getByTestId("answer-count")).toHaveText("3 of 3 answered", {
    timeout: 15_000,
  });
  await expectNoAxeViolations(page);

  // A reload mid-item comes back to the answer that was sent, not to a blank form.
  const reloaded = phones[0] as Page;
  await reloaded.reload();
  await expect(reloaded.getByTestId("answer-sent")).toBeVisible();
  await expect(reloaded.getByRole("checkbox", { name: OPTIONS[0] as string })).toBeChecked();
  await expect(reloaded.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Show answer", exact: true }).click();

  // The key and the rationale, on every phone, with each phone's own marks.
  for (const phone of phones) {
    await expect(phone.getByRole("complementary", { name: "Score" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(phone.getByText(RATIONALE)).toBeVisible();
  }
  // +/- scoring over two correct options: both right is two, one right and one wrong is nought.
  // Two phones, two different marks, from one key on one server.
  await expect((phones[0] as Page).getByRole("complementary", { name: "Score" })).toContainText(
    "2 / 2",
  );
  await expect((phones[2] as Page).getByRole("complementary", { name: "Score" })).toContainText(
    "0 / 2",
  );
  await expectNoAxeViolations(phones[0] as Page);

  // A late answer, after the key is up, is refused rather than quietly taken.
  await expect(
    (phones[2] as Page).getByRole("button", { name: "Submit", exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "End session", exact: true }).click();
  for (const phone of phones) {
    await expect(phone.getByText("This session has ended.")).toBeVisible({ timeout: 15_000 });
    await phone.close();
  }
});
