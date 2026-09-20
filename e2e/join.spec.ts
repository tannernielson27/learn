import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fillMultipleChoice, publishOpenItem } from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like liveSession.spec.ts. CI runs it in the `auth-e2e` job,
// which also has to pass SUPABASE_SECRET_KEY: resolving a join code is service-role only.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

const QR_LABEL = "QR code that opens the join page for this session";
const NO_SUCH_SESSION = "That code does not match a session that is open. Check it and try again.";

/**
 * A refusal about the code, read the way a screen reader reads it: tied to the code field by
 * `aria-describedby`, which asserts both the wording and the association at once.
 *
 * Deliberately not `getByRole("alert")`. Next renders its own empty route announcer with that
 * role on every page, so the bare role matches two elements and Playwright refuses it.
 */
async function expectCodeRefusal(page: Page, message: string) {
  await expect(page.getByRole("textbox", { name: "Session code" })).toHaveAccessibleDescription(
    message,
  );
}

test("a student scans the code, types a name, and comes back to the same place on reload", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, a bank, a published item, a session and a whole second journey through the join
  // flow: comfortably longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);

  const bankName = `Join ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
  // Four blank option fields, every label required: filling fewer leaves the item invalid and
  // publishOpenItem refuses (the thing that failed CI on #128).
  await fillMultipleChoice(
    page,
    "Which finding is expected?",
    ["Bradycardia", "Tachycardia", "Hypotension", "Bounding pulses"],
    1,
  );
  await publishOpenItem(page);
  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  const consoleUrl = page.url();

  // The console shows the code, the picture of the join address, and the address in words.
  const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");
  const joinAddress = await page.getByTestId("join-url").innerText();
  expect(joinAddress.endsWith(`/join/${code}`)).toBe(true);
  await expect(page.getByRole("img", { name: QR_LABEL })).toBeVisible();
  await expectNoAxeViolations(page);

  // From here on, a student. A second page in the same context keeps this project's viewport and
  // touch settings; the author's cookie is beside the point, because nothing on /join or /play
  // reads it.
  const student = await page.context().newPage();

  // Nobody walks into a session without a token, whatever address they guess.
  await student.goto(`/play/${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}`);
  await expect(student).toHaveURL(/\/join$/);
  await expectNoAxeViolations(student);

  // A code that is well formed but names nothing says so, and says nothing more than that.
  await student.getByRole("textbox", { name: "Session code" }).fill("ZZZZZZ");
  await student.getByRole("textbox", { name: "Display name" }).fill("Nobody");
  await student.getByRole("button", { name: "Join", exact: true }).click();
  await expectCodeRefusal(student, NO_SUCH_SESSION);
  await expectNoAxeViolations(student);

  // What the QR code does: the address carries the code, so only the name is left to type.
  await student.goto(`/join/${code}`);
  await expect(student.getByRole("textbox", { name: "Session code" })).toHaveValue(code);
  await student.getByRole("textbox", { name: "Display name" }).fill("Sam Okafor");
  await student.getByRole("button", { name: "Join", exact: true }).click();

  await expect(student).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  const seat = student.url();
  await expect(student.getByText("Joined as")).toContainText("Sam Okafor");
  await expect(student.getByText("You are in.")).toBeVisible();
  await expectNoAxeViolations(student);

  // Reload: the same seat, not a second one.
  await student.reload();
  expect(student.url()).toBe(seat);
  await expect(student.getByText("Joined as")).toContainText("Sam Okafor");

  // And joining the same room again with a different name does not make a second participant or
  // rename the first: the token, not the name, is who you are.
  await student.goto(`/join/${code}`);
  await student.getByRole("textbox", { name: "Display name" }).fill("Someone Else");
  await student.getByRole("button", { name: "Join", exact: true }).click();
  expect(student.url()).toBe(seat);
  await expect(student.getByText("Joined as")).toContainText("Sam Okafor");

  // The host ends the session. The student is told, rather than being dropped back on a form.
  await page.goto(consoleUrl);
  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect(page.getByText("This session has ended.")).toBeVisible();
  await expect(page.getByRole("img", { name: QR_LABEL })).toHaveCount(0);

  await student.goto(seat);
  await expect(student.getByText("This session has ended.")).toBeVisible();

  // And the code stops working for anyone who has not joined yet.
  await student.goto(`/join/${code}`);
  await student.getByRole("textbox", { name: "Display name" }).fill("Too Late");
  await student.getByRole("button", { name: "Join", exact: true }).click();
  await expectCodeRefusal(student, NO_SUCH_SESSION);

  await student.close();
});
