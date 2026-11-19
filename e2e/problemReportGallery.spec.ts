import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// "Tell us about a problem" (#568) in a real browser, from its gallery page with a fake send:
// the dialog, its states, axe in both themes, and a screenshot at each width.

const ready = async (page: Page) => {
  await page.goto("/gallery/support");
  await expect(
    page.getByRole("heading", { level: 1, name: "Tell us about a problem" }),
  ).toBeVisible();
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

const axe = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id} (${v.impact}): ${v.help}`)).toEqual([]);
};

test("the form opens with a focused title, refuses a short message and thanks a sent one", async ({
  page,
}, testInfo) => {
  await ready(page);
  await page.locator('[data-specimen="empty"]').click();

  const dialog = page.getByRole("dialog", { name: "Tell us about a problem", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Tell us about a problem" })).toBeFocused();
  const box = dialog.getByRole("textbox", { name: "What happened?" });
  await expect(box).toBeVisible();
  // The trap for scripts is out of the tab order and hidden from assistive tech.
  await expect(dialog.locator('input[name="website"]')).toHaveAttribute("tabindex", "-1");

  for (const target of [dialog.getByRole("button", { name: "Send", exact: true }), box]) {
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await axe(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/problem-report.png`,
  });

  await box.fill("broken");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(box).toHaveAttribute("aria-invalid", "true");
  await expect(box).toBeFocused();
  await expect(box).toHaveAccessibleDescription(/at least 10 characters/);

  await box.fill("The live session froze on question 3.");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Thanks, we got it. If we need more, we will reply to ada.brennan@example.edu.",
  );
  await expect(dialog.getByRole("textbox")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

for (const scheme of ["light", "dark"] as const) {
  test(`each state passes axe in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await ready(page);
    for (const id of ["from-error", "rate-limited", "failed", "sent", "signed-out"]) {
      await page.locator(`[data-specimen="${id}"]`).click();
      const dialog = page.getByRole("dialog", { name: "Tell us about a problem", exact: true });
      await expect(dialog).toBeVisible();
      await axe(page);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  });
}

test("signed out, the form offers the support address instead", async ({ page }) => {
  await ready(page);
  await page.locator('[data-specimen="signed-out"]').click();
  const dialog = page.getByRole("dialog", { name: "Tell us about a problem", exact: true });
  await expect(dialog.getByRole("link", { name: "support@learnursing.app" })).toHaveAttribute(
    "href",
    "mailto:support@learnursing.app",
  );
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
});
