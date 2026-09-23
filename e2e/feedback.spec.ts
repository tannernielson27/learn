import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { questionShown } from "./renderer";

const ready = async (page: Page, type: string) => {
  await page.goto(`/gallery/items/${type}`);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

test("feedback explains each choice where it was made", async ({ page }, testInfo) => {
  await ready(page, "multiple_response");

  const wrong = page.getByRole("checkbox", { name: /Temperature 37.2/ });
  // Nothing explains anything while the item is still open.
  await expect(page.getByText(/barely raised and expected/)).toHaveCount(0);

  await page.getByRole("checkbox", { name: /Respiratory rate 28/ }).click();
  await wrong.click();
  await page.getByRole("button", { name: "Submit" }).click();

  // The explanation sits with the option, and is read after it.
  await expect(page.getByText(/barely raised and expected with pneumonia/)).toBeVisible();
  await expect(wrong).toHaveAccessibleDescription(/barely raised and expected/);

  const breakdown = page.getByRole("complementary", { name: "Breakdown" });
  await expect(breakdown.getByRole("listitem")).toHaveCount(4);
  await expect(breakdown).toContainText("+1");
  await expect(breakdown).toContainText("-1");

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/feedback-rationale.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(page).toHaveScreenshot("feedback-rationale.png", { fullPage: true });
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
});

// #49: the six pointer-heavy renderers explain each element where it is. Each case answers the
// canonical fixture through the click, tap-to-place or already-arranged path that works at every
// viewport, then checks one element's explanation is on screen and is that element's description.

const visible = (page: Page, text: RegExp) => page.getByText(text).filter({ visible: true });

/** Chooses a bank word or bowtie choice, then the place it goes (the tap-to-place path). */
async function place(page: Page, choice: string, slot: string) {
  await page.getByRole("button", { name: choice, exact: true }).click();
  await page.getByRole("button", { name: slot, exact: true }).click();
}

const INLINE: {
  type: string;
  answer: (page: Page) => Promise<void>;
  control: (page: Page) => Locator;
  why: RegExp;
}[] = [
  {
    type: "highlight_text",
    answer: (page) => page.getByRole("button", { name: "Heart rate 54 and irregular" }).click(),
    control: (page) => page.getByRole("button", { name: /Heart rate 54 and irregular/ }),
    why: /reached the conduction system/,
  },
  {
    type: "highlight_table",
    // Grid from 768px, row cards below it; the hidden layout's copy is not in the tree.
    answer: (page) => page.getByRole("button", { name: "Lethargic, difficult to arouse" }).click(),
    control: (page) => page.getByRole("button", { name: /Lethargic, difficult to arouse/ }),
    why: /brain is under-perfused/,
  },
  {
    type: "dragdrop_cloze",
    answer: async (page) => {
      await place(page, "an inhaled corticosteroid", "Blank 1 of 2, empty");
      await place(page, "high Fowler position", "Blank 2 of 2, empty");
    },
    control: (page) => page.getByRole("button", { name: /^Blank 1 of 2/ }),
    why: /opens the airways within minutes/,
  },
  {
    type: "dragdrop_rationale",
    answer: async (page) => {
      await place(page, "atelectasis", "Blank 1 of 2, empty");
      await place(page, "prolonged immobility", "Blank 2 of 2, empty");
    },
    control: (page) => page.getByRole("button", { name: /^Blank 2 of 2/ }),
    why: /Splinting the incision keeps each breath shallow/,
  },
  {
    type: "ordered_response",
    // An ordered response opens already arranged, so it can be submitted as it is.
    answer: async () => {},
    control: (page) =>
      page
        .getByRole("list", { name: "Steps in order" })
        .getByRole("listitem")
        .filter({ hasText: "Begin chest compressions" }),
    why: /every minute without them/,
  },
  {
    type: "bowtie",
    answer: async (page) => {
      await place(page, "Obtain a 12-lead ECG within 10 minutes", "Actions to Take 1 of 2, empty");
      await place(page, "Encourage ambulation to relieve anxiety", "Actions to Take 2 of 2, empty");
      await place(page, "Acute myocardial infarction", "Potential Condition, empty");
      await place(page, "Serial troponin levels", "Parameters to Monitor 1 of 2, empty");
      await place(page, "Bowel sounds", "Parameters to Monitor 2 of 2, empty");
    },
    control: (page) => page.getByRole("button", { name: /^Actions to Take 2 of 2: Encourage/ }),
    why: /raises the heart's oxygen demand/,
  },
];

for (const { type, answer, control, why } of INLINE) {
  test(`${type}: feedback explains each element where it is`, async ({ page }, testInfo) => {
    await ready(page, type);
    await questionShown(page);
    await expect(page.getByText(why)).toHaveCount(0);

    await answer(page);
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(visible(page, why)).toBeVisible();
    await expect(control(page)).toHaveAccessibleDescription(why);
    // At 375px the explanations must fit the page, not widen it.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}/feedback-inline-${type}.png`,
      fullPage: true,
    });
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(
      violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.help}`),
    ).toEqual([]);
  });
}
