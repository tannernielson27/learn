import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import { seedQuiz } from "./seedQuiz";
import { signInAsNewAuthor, updateAsAdmin } from "./signIn";
import { skipWelcomes } from "./welcome";

/**
 * The class-day flow on a student's phone and a tablet (2026-10-27): join, a multiple-choice and a
 * multiple-response question, answer sent, the reveal, time up and the end, then the stage's end
 * screen. Each screen gets axe (serious and critical) and a check that the page itself never
 * scrolls sideways. Screenshots are attached to the report rather than kept as baselines, which
 * only CI's own workflow writes (docs/05).
 *
 * Soft assertions, so one run names every screen that fails rather than the first.
 */

const PHONE_PROJECTS = ["phone-375", "tablet-768"];

async function checkScreen(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect.soft(overflow, `${name}: the page scrolls sideways`).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect
    .soft(
      violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`),
      `${name}: axe`,
    )
    .toEqual([]);
  await testInfo.attach(`${testInfo.project.name}-${name}.png`, {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  });
}

test.describe("join screen", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!PHONE_PROJECTS.includes(testInfo.project.name), "a phone and a tablet only");
  });

  test("an empty join screen and one opened from the QR code", async ({ page }, testInfo) => {
    await skipWelcomes(page);
    await page.goto("/join");
    await expect(
      page.getByRole("heading", { level: 1, name: "Join a live session", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Join code", exact: true })).toBeFocused();
    await checkScreen(page, testInfo, "join-empty");

    await page.goto("/join/ABC234");
    await expect(page.getByRole("textbox", { name: "Join code", exact: true })).toHaveValue(
      "ABC234",
    );
    await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toBeFocused();
    // A long name typed in does not widen the page.
    await page
      .getByRole("textbox", { name: "Display name", exact: true })
      .fill("Marisol Okonkwo-Fitzgerald-Abernathy");
    await checkScreen(page, testInfo, "join-from-qr");
  });

  test("the join screen at 320px, as a 640px phone at 200% zoom reflows", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await skipWelcomes(page);
    await page.goto("/join/ABC234");
    await expect(page.getByRole("button", { name: "Join", exact: true })).toBeVisible();
    await checkScreen(page, testInfo, "join-320");
  });
});

/** Joins the open live session as `name` in a browser of its own (see liveAnswer.spec.ts). */
async function join(
  browser: Browser,
  origin: string,
  shape: BrowserContextOptions,
  code: string,
  name: string,
): Promise<Page> {
  const context = await browser.newContext({ ...shape, baseURL: origin, reducedMotion: "reduce" });
  const phone = await context.newPage();
  await skipWelcomes(phone);
  await phone.goto(`/join/${code}`);
  await phone.getByRole("textbox", { name: "Display name", exact: true }).fill(name);
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await expect(phone).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  return phone;
}

const MC_STEM = "Class day: which action should the nurse take first?";
const MR_STEM = "Class day: which findings require follow-up? Select all that apply.";
const MC_RIGHT = "Auscultate the lungs and assess oxygen saturation";
const MR_PICK = "New confusion per family";

/** The two fixtures with stems of their own, published with the local secret key. */
async function seedTwoQuestions(page: Page, request: Parameters<typeof seedQuiz>[1]) {
  const items = [
    { ...FIXTURES.multiple_choice.canonical, id: "class-day-mc", stem: md(MC_STEM) },
    { ...FIXTURES.multiple_response.canonical, id: "class-day-mr", stem: md(MR_STEM) },
  ];
  await seedQuiz(page, request, JSON.stringify({ format: "learn.v1", items }));
  const bankId = new URL(page.url()).pathname.split("/").at(-1);
  await updateAsAdmin(request, "items", `bank_id=eq.${bankId}`, { status: "published" });
  await page.reload();
}

const md = (value: string) => ({ kind: "markdown", value });

test.describe("live session on a phone", () => {
  // Needs the local Supabase stack with Realtime, like liveAnswer.spec.ts (the `auth-e2e` job).
  test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

  test("join, answer, sent, reveal, time up, end, and the stage's end screen", async ({
    browser,
    page,
    request,
  }, testInfo) => {
    test.skip(!PHONE_PROJECTS.includes(testInfo.project.name), "a phone and a tablet only");
    // Two questions, one of them waited out on a 30-second clock.
    test.setTimeout(240_000);
    await signInAsNewAuthor(page, request, testInfo.project.name);

    const quizName = `Class day ${testInfo.project.name} ${Date.now()}`;
    await page.getByRole("textbox", { name: "Quiz name", exact: true }).fill(quizName);
    await page.getByRole("button", { name: "Create quiz", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: quizName, exact: true }),
    ).toBeVisible();
    await seedTwoQuestions(page, request);

    await page.getByRole("button", { name: "Start a live session", exact: true }).click();
    await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
    const consolePath = new URL(page.url()).pathname;
    const code = (await page.getByTestId("join-code").innerText()).replace(/\s/g, "");
    const { viewport, isMobile, hasTouch } = testInfo.project.use;
    const phone = await join(
      browser,
      new URL(page.url()).origin,
      { viewport, isMobile, hasTouch },
      code,
      "Marisol Okonkwo-Fitzgerald",
    );

    // Waiting for the teacher.
    await expect(
      phone.getByText("You are in. Wait for your teacher to start.", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await checkScreen(phone, testInfo, "phone-waiting");

    const perItem = page.getByRole("combobox", { name: "Time per question", exact: true });
    await perItem.selectOption({ label: "30 seconds" });
    await page.getByRole("button", { name: "Start", exact: true }).click();

    // Multiple choice: answering, then sent.
    await expect(phone.getByText(MC_STEM, { exact: true })).toBeVisible({ timeout: 15_000 });
    await checkScreen(phone, testInfo, "phone-answering-mc");
    await phone.getByRole("radio", { name: MC_RIGHT, exact: true }).click();
    await phone.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(phone.getByTestId("answer-sent")).toBeVisible({ timeout: 15_000 });
    await checkScreen(phone, testInfo, "phone-answer-sent");

    // The reveal, with this phone's own marks.
    await page.getByRole("button", { name: "Show answer", exact: true }).click();
    await expect(phone.getByRole("complementary", { name: "Score", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await checkScreen(phone, testInfo, "phone-reveal-answered");

    // Multiple response: answering, then the clock runs out with a pick not sent.
    await page.getByRole("button", { name: "Next question", exact: true }).click();
    await expect(phone.getByText(MR_STEM, { exact: true })).toBeVisible({ timeout: 15_000 });
    await checkScreen(phone, testInfo, "phone-answering-mr");
    await phone.getByRole("checkbox", { name: MR_PICK, exact: true }).click();
    await expect(
      phone.getByRole("status").filter({ hasText: "Time is up. Wait for the answer." }),
    ).toBeVisible({ timeout: 60_000 });
    await checkScreen(phone, testInfo, "phone-time-up");

    // The reveal on a phone that did not answer.
    await page.getByRole("button", { name: "Show answer", exact: true }).click();
    await expect(phone.getByTestId("not-answered")).toBeVisible({ timeout: 15_000 });
    await checkScreen(phone, testInfo, "phone-reveal-not-answered");

    // The end, on the phone and on the stage.
    await page.getByRole("button", { name: "End live session", exact: true }).click();
    await page.getByRole("button", { name: "End live session", exact: true }).click();
    await expect(phone.getByText("This live session has ended.", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await checkScreen(phone, testInfo, "phone-ended");

    const projector = await page.context().newPage();
    await projector.setViewportSize({ width: 1280, height: 720 });
    await projector.goto(`${consolePath}?view=projector`);
    const stage = projector.getByRole("region", { name: "Projector view", exact: true });
    await expect(stage.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    await checkScreen(projector, testInfo, "stage-ended");
    await projector.close();
    await phone.context().close();
  });
});
