import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The teacher's live console (#563 round 3) in each state, from `/gallery/live/console`: the
// in-memory room, no database and no Realtime, so it runs in CI and against every preview.
// Screens go to test-results/screenshots, as the billing gallery's do.
const STATES = ["lobby", "question", "question-untimed", "reconnecting", "offline", "ended"];

// The console draws its own `main`, as it does on its own page; in the gallery it sits inside the
// gallery frame's `main`. Only the landmark rules about that are set aside, for that reason alone.
const FRAME_RULES = ["landmark-main-is-top-level", "landmark-no-duplicate-main", "landmark-unique"];

for (const state of STATES) {
  test(`the live console, ${state}: layout, accessibility and a screen`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/gallery/live/console?state=${state}`);
    const demo = page.getByTestId("console-demo");
    await expect(demo).toHaveAttribute("data-ready", "true");
    await page.evaluate(() => document.fonts.ready);

    if (state === "question" || state === "reconnecting") {
      for (const name of ["Add 15 seconds", "Stop timer"]) {
        const button = demo.getByRole("button", { name, exact: true });
        await expect(button).toBeEnabled();
        expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await expect(demo.getByTestId("answer-count")).toHaveText("3 of 4 answered");
      await expect(demo.getByRole("heading", { name: "Answered", exact: true })).toHaveCount(0);
    }
    if (state === "question-untimed") {
      await expect(
        demo.getByRole("button", { name: "Add 15 seconds", exact: true }),
      ).toBeDisabled();
      await expect(demo.getByRole("button", { name: "Stop timer", exact: true })).toBeDisabled();
    }
    if (state === "reconnecting") {
      await expect(demo.getByRole("status").filter({ hasText: "Reconnecting" })).toHaveCount(2);
    }
    if (state === "offline") {
      await expect(demo.getByRole("alert")).toHaveText(
        /Offline\s*Live updates stopped\. Reload to catch up\./,
      );
    }

    const { violations } = await new AxeBuilder({ page }).disableRules(FRAME_RULES).analyze();
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await demo.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}/live-console-${state}.png`,
    });
  });
}
