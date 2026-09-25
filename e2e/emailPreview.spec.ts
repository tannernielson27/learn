import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// #268: every message LeaRN sends, rendered with sample data at /gallery/email. Needs no stack:
// it runs against the preview deployment in the e2e workflow and on the local build in auth e2e.
// That it answers 404 on production is checked where the rest of the gallery's closure is:
// scripts/gallery-closed.mjs (on the response bytes) and src/app/gallery/gate.test.ts.

const MESSAGES = [
  { id: "magic-link", name: "Sign-in link", button: "Sign in" },
  { id: "reminder-opened", name: "Assignment is open", button: "Open the assignment" },
  { id: "reminder-closing-soon", name: "Assignment closes soon", button: "Finish the assignment" },
] as const;

test("the email preview renders every message, readable at this width", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/gallery/email");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Email preview", exact: true }),
  ).toBeVisible();

  for (const message of MESSAGES) {
    const section = page.getByRole("region", { name: message.name, exact: true });
    await expect(section).toBeVisible();
    const email = section.locator(`[data-email="${message.id}"]`);
    await expect(email.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(email.getByRole("link", { name: message.button, exact: true })).toBeVisible();
    // The same link as visible text, for a client that drops the button.
    await expect(email.getByText("Or copy this link into your browser:")).toBeVisible();
  }

  // The plain-text part of a reminder says the same thing, link included.
  const text = page.locator('[data-email-text="reminder-opened"]');
  await expect(text).toContainText("Week 5: Heart failure & fluid balance is open in LeaRN.");
  await expect(text).toContainText("https://learn.example/learn/assignments/");

  // Nothing in an email is wider than a phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/email-preview.png`,
    fullPage: true,
  });

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
});

test("the preview escapes the sample title rather than rendering it as markup", async ({
  page,
}) => {
  await page.goto("/gallery/email");
  const heading = page.locator('[data-email="reminder-opened"] h1');
  await expect(heading).toHaveText("Week 5: Heart failure & fluid balance is open in LeaRN.");
  // An `&` that reached the page as `&amp;amp;` would show up as text here.
  await expect(heading).not.toContainText("&amp;");
});
