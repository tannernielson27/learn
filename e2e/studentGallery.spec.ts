import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * What a student sees outside the question player (#563), from fixtures (`/gallery/student`): the
 * home on first use, with lists, and in two workspaces, and the frame of an assignment part way
 * through a case study. Join is in the first screen, axe finds nothing serious, nothing scrolls
 * sideways. No pixel baseline: the screens are checked by what they say and where things are.
 */
const open = async (page: Page, state: string) => {
  await page.goto(`/gallery/student?state=${state}`);
  await page.evaluate(() => document.fonts.ready);
};

async function expectClean(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
}

test("student home, first use: the join code first and one empty state", async ({ page }) => {
  await open(page, "first-use");
  const demo = page.getByTestId("student-demo");
  const join = demo.getByRole("form", { name: "Join a live session", exact: true });
  await expect(join.getByRole("textbox", { name: "Join code", exact: true })).toBeVisible();
  await expect(join.getByRole("button", { name: "Join", exact: true })).toBeVisible();
  // In the first screen at 667px, measured from the top of the student's own frame.
  const top = (await demo.boundingBox())!.y;
  const bottom = await join.evaluate((form) => form.getBoundingClientRect().bottom);
  expect(bottom - top).toBeLessThanOrEqual(667);
  await expect(demo.locator("[data-empty-state]")).toHaveCount(1);
  await expect(demo.getByRole("heading", { level: 2, name: "Nothing here yet" })).toBeVisible();
  await expect(demo.getByRole("region", { name: "Assignments", exact: true })).toHaveCount(0);
  await expectClean(page);
});

test("student home with lists, in one workspace and in two", async ({ page }) => {
  await open(page, "home");
  const demo = page.getByTestId("student-demo");
  for (const name of ["Assignments", "Results", "Live sessions", "Practice"]) {
    await expect(demo.getByRole("region", { name, exact: true })).toBeVisible();
  }
  const classes = demo.getByRole("list", { name: "Your classes", exact: true });
  await expect(classes).not.toContainText("LeaRN");
  await expectClean(page);

  await open(page, "workspaces");
  await expect(
    page
      .getByTestId("student-demo")
      .getByRole("list", { name: "Your classes", exact: true })
      .getByText("Riverside College of Nursing", { exact: true }),
  ).toBeVisible();
  await expectClean(page);
});

test("assignment frame: the count and the list agree, Submit quiet until done", async ({
  page,
}) => {
  await open(page, "assignment");
  const demo = page.getByTestId("student-demo");
  await expect(demo.getByTestId("answered-count")).toHaveText("4 of 9 answered");
  await expect(
    demo.getByRole("navigation", { name: "Questions", exact: true }).getByRole("button"),
  ).toHaveCount(6);
  await expect(demo.getByTestId("unopened-note")).toHaveText(
    "Questions 7 to 9 open as you answer the ones before them.",
  );
  const submit = demo.getByRole("button", { name: "Submit assignment", exact: true });
  await expect(submit).toBeVisible();
  await expect(submit).not.toHaveClass(/\bbg-accent\b/);
  await expect(demo.getByRole("link", { name: "Back to your classes", exact: true })).toBeVisible();
  await expectClean(page);
});
