import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The host console's results views (#180), one per item type, from the fixtures. Screenshots of
 * four of them — the kinds a class sees most — at every viewport, before and after the reveal,
 * and axe over the whole page in both states.
 */
const open = async (page: Page, revealed: boolean) => {
  await page.goto(`/gallery/live/results${revealed ? "?revealed=1" : ""}`);
  await expect(page.getByRole("heading", { level: 1, name: "Results views" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

const SHOTS: { name: string; type: string; revealed: boolean }[] = [
  { name: "live-results-sata.png", type: "multiple_response", revealed: false },
  { name: "live-results-sata-revealed.png", type: "multiple_response", revealed: true },
  { name: "live-results-matrix-revealed.png", type: "matrix_multiple_choice", revealed: true },
  { name: "live-results-rationale-revealed.png", type: "dropdown_rationale", revealed: true },
];

async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
}

async function expectNoPageScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const revealed of [false, true]) {
  test(`results views ${revealed ? "after" : "before"} the reveal: accessibility and layout`, async ({
    page,
  }) => {
    await open(page, revealed);
    // All fourteen types draw a view of their own.
    await expect(page.getByTestId("results-view")).toHaveCount(14);
    // Nothing marked correct before the reveal; the key's choices, in words, after it.
    const marks = await page.getByTestId("result-correct").count();
    if (revealed) expect(marks).toBeGreaterThan(0);
    else expect(marks).toBe(0);
    await expectNoPageScroll(page);
    await expectNoSeriousViolations(page);
  });
}

for (const shot of SHOTS) {
  test(`results view screenshot: ${shot.name}`, async ({ page }, testInfo) => {
    await open(page, shot.revealed);
    const section = page.getByTestId(`results-${shot.type}`);
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}/${shot.name}`,
    });
    if (process.env.CI) {
      await expect(section).toHaveScreenshot(shot.name);
    }
  });
}

test("a heat map that is wider than a phone scrolls from the keyboard, inside its own box", async ({
  page,
}) => {
  await open(page, true);
  const region = page
    .getByTestId("results-matrix_multiple_choice")
    .getByRole("region", { name: /: answers by row and column$/ });
  await region.focus();
  await expect(region).toBeFocused();
  await expectNoPageScroll(page);
});
