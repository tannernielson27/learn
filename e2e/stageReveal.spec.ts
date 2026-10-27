import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * The answer key on a 1280×720 stage for every item type, from the gallery's fixtures
 * (feat/stage-answer-key). Captured with `page.screenshot` into test-results/screenshots for a
 * person to look at, rather than as a visual-diff baseline, as the podium is, until baselines are
 * regenerated on CI (docs/05).
 */
const TYPES = [
  "multiple-choice",
  "multiple-response",
  "multiple-response-grouping",
  "matrix-multiple-choice",
  "matrix-multiple-response",
  "dropdown-cloze",
  "dropdown-rationale",
  "dropdown-table",
  "highlight-text",
  "highlight-table",
  "dragdrop-cloze",
  "dragdrop-rationale",
  "ordered-response",
  "bowtie",
] as const;

test("the projector's answer key: every type fits the wall, key marked", async ({
  page,
}, testInfo) => {
  await page.goto("/gallery/live/stage-reveal");
  await expect(
    page.getByRole("heading", { level: 1, name: "Projector answer key", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  // Multiple choice keeps the class's chart, the key named in words with its whole text.
  const mc = page.getByTestId("stage-reveal-multiple-choice");
  await expect(mc.locator("li[data-key]")).toHaveCount(1);
  await expect(mc.locator("li[data-key]")).toContainText("Correct");

  // The bowtie, filled with its key, and the other choices listed as not correct.
  const bowtie = page.getByTestId("stage-reveal-bowtie");
  await expect(bowtie.getByText("Correct", { exact: true })).toHaveCount(5);
  await expect(bowtie.getByTestId("stage-not-correct")).toContainText("Panic attack");

  for (const type of TYPES) {
    const stage = page.getByTestId(`stage-reveal-${type}`);
    // Matrix and grouping draw a grid and row cards and show one per width, so skip the hidden one.
    await expect(
      stage
        .getByText(/Correct/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    // Nothing on the wall takes focus: the stage's own keys (Space, the right arrow) still work.
    if (!type.startsWith("multiple-choice") && type !== "multiple-response") {
      await expect(stage.getByTestId("stage-key")).toHaveAttribute("inert", "");
    }
    // The fitted view never spills past the bottom of the 720px stage.
    const box = await stage.boundingBox();
    const fitted = stage.getByTestId("stage-fit-view");
    const view = await fitted.boundingBox();
    expect(box).not.toBeNull();
    expect(view).not.toBeNull();
    if (box && view) {
      expect(view.y + view.height).toBeLessThanOrEqual(box.y + box.height + 1);
      expect(view.x + view.width).toBeLessThanOrEqual(box.x + box.width + 1);
    }
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);

  for (const type of TYPES) {
    await page.getByTestId(`stage-reveal-${type}`).screenshot({
      path: `test-results/screenshots/${testInfo.project.name}/stage-reveal-${type}.png`,
    });
  }
});
