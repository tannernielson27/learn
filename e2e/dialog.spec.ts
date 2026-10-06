import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The Dialog primitive (#357) in a real browser, where `showModal()` does the work jsdom cannot:
// the top layer, the inert page behind, Escape and the focus that comes back.

const ready = async (page: Page) => {
  await page.goto("/gallery/primitives");
  await expect(page.getByRole("heading", { level: 1, name: "Primitives" })).toBeVisible();
  await expect(page.locator('section[data-hydrated="true"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

test("a dialog opens over an inert page, passes axe and closes on Escape", async ({
  page,
}, testInfo) => {
  await ready(page);
  const opener = page.getByRole("button", { name: "Open dialog", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Archive this class?", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(
    "Students keep their results, and you can restore the class later.",
  );
  await expect(dialog.getByRole("heading", { name: "Archive this class?" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");

  // A sheet on the bottom edge on a phone; a centred card from 768px.
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  if (testInfo.project.name === "phone-375") {
    expect(Math.round(box.width)).toBe(viewport.width);
    expect(Math.round(box.y + box.height)).toBe(viewport.height);
  } else {
    expect(box.width).toBeLessThan(viewport.width);
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
  }

  await page.screenshot({ path: `test-results/screenshots/${testInfo.project.name}/dialog.png` });

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id} (${v.impact}): ${v.help}`)).toEqual([]);

  // Tab walks the dialog and never reaches the page behind it.
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Archive", exact: true })).toBeFocused();
  // Tab is never held by a key handler, and the page behind is inert: wherever focus goes next
  // (the browser's own chrome, then the dialog again) it is never a link or button of the page.
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press("Tab");
    const where = await dialog.evaluate((el) => {
      const active = document.activeElement;
      return el.contains(active) || active === document.body || active === null;
    });
    expect(where).toBe(true);
  }
  // A pointer cannot reach the page behind either.
  await expect(opener.click({ trial: true, timeout: 500 })).rejects.toThrow();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
});

test("a stepped dialog is walked with the keyboard and announces its step", async ({
  page,
}, testInfo) => {
  await ready(page);
  const opener = page.getByRole("button", { name: "Open stepped dialog", exact: true });
  await opener.click();

  const dialog = page.getByRole("dialog");
  const count = dialog.getByRole("status");
  await expect(count).toHaveText("Step 1 of 3");
  await expect(dialog.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Next", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(count).toHaveText("Step 2 of 3");
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/dialog-stepped.png`,
  });
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id} (${v.impact}): ${v.help}`)).toEqual([]);

  // Back to the first step takes the Back button away; focus must not fall out of the dialog.
  await dialog.getByRole("button", { name: "Back", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(count).toHaveText("Step 1 of 3");
  await expect(dialog.getByRole("button", { name: "Next", exact: true })).toBeFocused();

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(count).toHaveText("Step 3 of 3");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-dialog-result]")).toHaveText("Finished");
  await expect(opener).toBeFocused();

  await opener.click();
  await dialog.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.locator("[data-dialog-result]")).toHaveText("Skipped");
});

test("the dialog moves on transform and opacity only, and not at all with reduced motion", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "motion is the same at every width");
  const transition = () =>
    page
      .locator("dialog.motion-dialog")
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return { property: style.transitionProperty, duration: style.transitionDuration };
      });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await ready(page);
  // `display` and `overlay` flip at the end of the fade (allow-discrete); nothing lays out.
  expect((await transition()).property).toBe("opacity, transform, display, overlay");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await transition();
  expect(reduced.property === "none" || /^0s(, 0s)*$/.test(reduced.duration)).toBe(true);
});
