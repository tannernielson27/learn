import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fillMultipleChoice, publishOpenItem } from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

/** Two groups of three from the unambiguous alphabet, exactly as the console shows it. */
const CODE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{3} [23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{3}$/;

test("an instructor starts a session from a bank, sees a six-character code, and ends it", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, a bank, a published item and two session calls: longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);

  const bankName = `Live ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Quiz name" }).fill(bankName);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  // A bank with nothing published cannot be run, and says so rather than failing quietly.
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(
    page.getByText("Publish a question in this quiz before starting a live session."),
  ).toBeVisible();

  await page.getByRole("link", { name: "New question" }).click();
  await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
  // A new item starts with four blank option fields and every label is required, so filling only
  // two leaves the item invalid on options C and D. publishOpenItem asserts the editor lists no
  // problems, so all four have to be filled.
  await fillMultipleChoice(
    page,
    "Which finding is expected?",
    ["Bradycardia", "Tachycardia", "Hypotension", "Bounding pulses"],
    1,
  );
  await publishOpenItem(page);
  await page.getByRole("link", { name: "Back to quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  const consoleUrl = page.url();

  const code = page.getByTestId("join-code");
  await expect(code).toHaveText(CODE);
  await expect(
    page
      .getByRole("region", { name: "Join code" })
      .getByRole("img", { name: "QR code for joining this live session" }),
  ).toBeVisible();
  // The three Playwright projects are 375, 768 and 1280, so this runs at each breakpoint; the code
  // has to be visible and whole at every one.
  await expect(code).toBeVisible();
  // An empty lobby says so, and offers only the move an empty lobby can make.
  await expect(page.getByText("Nobody has joined yet.")).toBeVisible();
  await expect(page.getByTestId("present-count")).toHaveText("0 phones connected");
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await expectNoAxeViolations(page);

  // A phone joins. From here the two pages are a room: nothing below reloads either of them.
  const student = await page.context().newPage();
  await student.goto(`/join/${(await code.innerText()).replace(/\s/g, "")}`);
  await student.getByRole("textbox", { name: "Display name" }).fill("Ada Brennan");
  await student.getByRole("button", { name: "Join", exact: true }).click();
  await expect(student).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  await expect(student.getByText("You are in. Wait for your teacher to start.")).toBeVisible();
  await expectNoAxeViolations(student);

  // Presence, not a reload and not a database read: the name and the count arrive on the host's
  // screen while it is sitting there.
  await expect(page.getByText("Ada Brennan")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("present-count")).toHaveText("1 phone connected");

  // The projector view of the same live session, in a second window as a teacher opens it from
  // the lobby. It is a laptop's second screen, so it is checked at the laptop's size only.
  const projecting = testInfo.project.name === "desktop-1280";
  const projector = projecting ? await page.context().newPage() : null;
  const stage = projector?.getByRole("region", { name: "Projector view" });
  if (projector && stage) {
    await projector.setViewportSize({ width: 1920, height: 1080 });
    await projector.goto(`${new URL(consoleUrl).pathname}?view=projector`);
    await expect(stage.getByTestId("join-code")).toHaveText(CODE);
    // Names show on the stage in the lobby only (owner decision 4).
    await expect(stage.getByText("Ada Brennan", { exact: true })).toBeVisible({ timeout: 15_000 });
    // A projector window of its own has nothing to press (code review M2).
    await expect(stage.getByRole("button")).toHaveCount(0);
    await expectNoAxeViolations(projector);
  }

  // Starting the room moves the phone. The bank holds one item, so this is also the last one.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  // Since #133 the phone shows the item itself rather than a waiting screen. Answering it is
  // liveAnswer.spec.ts; what matters here is that the room's move reached the phone.
  await expect(student.getByText("Which finding is expected?")).toBeVisible({ timeout: 15_000 });
  await expect(student.getByRole("radio", { name: "Bradycardia" })).toBeVisible();
  await expectNoAxeViolations(student);
  await expectNoAxeViolations(page);
  if (projector && stage) {
    // The question and its lettered options, the same order as the phone, and no names.
    await expect(stage.getByText("Which finding is expected?")).toBeVisible({ timeout: 15_000 });
    await expect(
      stage.getByRole("list", { name: "Choices", exact: true }).getByRole("listitem").first(),
    ).toContainText("A. Bradycardia");
    await expect(stage.getByText("Ada Brennan", { exact: true })).toHaveCount(0);
    await expect(stage.getByText("Correct", { exact: true })).toHaveCount(0);
    await expectNoAxeViolations(projector);
  }
  // "Next question" waits until the answer is showing, so the reveal is never skipped.
  await expect(page.getByRole("button", { name: "Next question", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Show answer", exact: true }).click();
  // A phone that did not answer is shown the key too (#181).
  await expect(student.getByTestId("not-answered")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Show answer", exact: true })).toBeDisabled();
  // Nothing to advance to, and the console says so by greying the button rather than by refusing.
  await expect(page.getByRole("button", { name: "Next question", exact: true })).toBeDisabled();
  if (projector && stage) {
    // The key, marked in words, once the answer is showing.
    await expect(stage.getByText("Correct", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expectNoAxeViolations(projector);
    await projector.close();
  }

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(student.getByText("The live session is paused.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Resume", exact: true }).click();

  await page.getByRole("button", { name: "End live session", exact: true }).click();
  // It asks first; the second press is the one in the question.
  await page.getByRole("button", { name: "End live session", exact: true }).click();
  await expect(student.getByText("This live session has ended.")).toBeVisible({ timeout: 15_000 });
  await student.close();

  // The ended page points at the report.
  await expect(page.getByRole("link", { name: "Open the report", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "End live session", exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page);

  // An ended session cannot be reopened, however the page is reached again.
  await page.goto(consoleUrl);
  await expect(page.getByRole("link", { name: "Open the report", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
});
