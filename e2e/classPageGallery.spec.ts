import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The class page's header and tabs, from the gallery's fixture (no database), so the layout has
// a baseline at every viewport. Needs no stack, so it runs against every preview.
const TABS = [
  ["overview", "Overview"],
  ["students", "Students"],
  ["assignments", "Assignments"],
  ["settings", "Settings"],
] as const;

for (const [tab, label] of TABS) {
  test(`the class page's ${label} tab: layout, accessibility and its baseline`, async ({
    page,
  }) => {
    await page.goto(tab === "overview" ? "/gallery/class-page" : `/gallery/class-page?tab=${tab}`);
    const demo = page.getByTestId("class-page-demo");
    await expect(demo).toHaveAttribute("data-hydrated", "true");
    await page.evaluate(() => document.fonts.ready);

    await expect(
      demo.getByRole("heading", { level: 1, name: "NUR 310 Adult Health, Fall", exact: true }),
    ).toBeVisible();
    await expect(demo.getByTestId("class-code")).toHaveText("HK7M-2QPW");
    const nav = demo.getByRole("navigation", { name: "Class views", exact: true });
    const current = nav.locator("a[aria-current]");
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(label);
    await expect(current).toHaveAttribute("aria-current", "page");

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
    // The tabs scroll inside their own row on a phone; the page never scrolls sideways.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await expect(demo).toHaveScreenshot(`class-page-${tab}.png`);
  });
}

test("the class page's tabs are reached with Tab and show where focus is", async ({ page }) => {
  await page.goto("/gallery/class-page?tab=students");
  await expect(page.getByTestId("class-page-demo")).toHaveAttribute("data-hydrated", "true");
  const nav = page.getByRole("navigation", { name: "Class views", exact: true });
  const overview = nav.getByRole("link", { name: "Overview", exact: true });
  await overview.focus();
  await page.keyboard.press("Tab");
  const students = nav.getByRole("link", { name: "Students", exact: true });
  await expect(students).toBeFocused();
  const outline = await students.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).toBe("solid");
  // Every tab is a full tap target.
  for (const link of await nav.getByRole("link").all()) {
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
