import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The signed-in app's frame (#563, docs/04 §11) from the gallery's fixtures: no session, so it runs
// in CI and against every preview. Screens go to test-results/screenshots; no baseline is kept.

test("the app shell: a one-row phone bar, the nav as one scrolling row, identity in the menu", async ({
  page,
}, testInfo) => {
  await page.goto("/gallery/app-shell");
  await page.evaluate(() => document.fonts.ready);

  const phone = page.getByTestId("shell-teacher-phone");
  const bar = phone.locator("[data-app-bar]");
  // A real browser names the wordmark's flex parts apart ("Lea RN"); it must read as one word.
  await expect(bar.getByRole("link", { name: "LeaRN", exact: true })).toBeVisible();
  // The wordmark and the account button on one 64px row, the nav on one 44px row: 112px at most.
  expect((await bar.boundingBox())?.height ?? 0).toBeLessThanOrEqual(112);
  const nav = phone.getByRole("navigation", { name: "Main, teacher on a phone" });
  const links = nav.getByRole("link");
  await expect(links).toHaveText(["Library", "Classes", "Live sessions", "Workspace"]);
  const tops = await Promise.all((await links.all()).map(async (l) => (await l.boundingBox())?.y));
  expect(new Set(tops).size).toBe(1);
  for (const link of await links.all()) {
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  // Scrolled so the current link shows whole.
  const scrolled = page.getByTestId("shell-teacher-phone-scrolled");
  const current = scrolled.locator("a[aria-current]");
  await expect(current).toHaveText("Workspace");
  const whole = await current.evaluate((link) => {
    const row = link.closest("ul")!.getBoundingClientRect();
    const box = link.getBoundingClientRect();
    return box.left >= row.left && box.right <= row.right;
  });
  expect(whole).toBe(true);

  // No email in the bar: it is inside the account menu.
  const address = phone.getByTestId("signed-in-address");
  await expect(address).toBeHidden();
  await phone.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(address).toBeVisible();
  await expect(address).toHaveText("c.okonkwo@nursing.example");
  await expect(phone.getByTestId("signed-in-name")).toHaveText("Chidinma Okonkwo");
  await page.keyboard.press("Escape");
  await expect(address).toBeHidden();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/app-shell.png`,
    fullPage: true,
  });
});
