import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import { seedQuiz } from "./seedQuiz";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

const KEPT = "Archive demo item that stays";
const FILED = "Archive demo item to file away";

/** Two items only, so the bank's one page holds both however the list pages. */
const itemsJson = JSON.stringify({
  format: "learn.v1",
  items: [KEPT, FILED].map((stem, index) => ({
    ...FIXTURES.multiple_choice.canonical,
    id: `archive-demo-${index}`,
    stem: { kind: "markdown", value: stem },
  })),
});

test("an author archives an item, finds it in the Archived view, and restores it", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, seeding, an archive and a restore: longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `Archive ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(bankName);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  const bankUrl = page.url();

  await seedQuiz(page, request, itemsJson);
  const items = page.getByRole("list", { name: "Questions" });
  const kept = items.getByRole("link", { name: new RegExp(`^${KEPT}`) });
  const filed = items.getByRole("link", { name: new RegExp(`^${FILED}`) });
  await expect(kept).toBeVisible();
  await expect(filed).toBeVisible();

  // Archive one item from its own page.
  await filed.click();
  await expect(page.getByRole("textbox", { name: "Question stem", exact: true })).toHaveValue(
    FILED,
  );
  await page.getByRole("button", { name: "Archive question", exact: true }).click();
  await expect(page.getByText("This question is archived.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore question", exact: true })).toBeVisible();
  await expectNoAxeViolations(page);

  // It has left the bank's list; the other item is still there.
  await page.goto(bankUrl);
  await expect(kept).toBeVisible();
  await expect(filed).toHaveCount(0);

  // The Archived view shows it, and only it.
  const views = page.getByRole("navigation", { name: "Current or archived" });
  await views.getByRole("link", { name: "Archived", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Archived questions" })).toBeVisible();
  await expect(filed).toBeVisible();
  await expect(kept).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/bank-archived.png`,
    fullPage: true,
  });

  // Restore it from its row: the Archived view empties.
  await page.getByRole("button", { name: `Restore ${FILED}`, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No archived questions here", exact: true }),
  ).toBeVisible();

  // And it is back among the bank's current items.
  await views.getByRole("link", { name: "Current", exact: true }).click();
  await expect(kept).toBeVisible();
  await expect(filed).toBeVisible();
});

const LIST_STEMS = ["Quiz page archive one", "Quiz page archive two", "Quiz page archive three"];

test("a teacher archives questions from the quiz page, one and several, then restores one (#471)", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `Archive list ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name" }).fill(bankName);
  await page.getByRole("button", { name: "Create quiz" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();

  await seedQuiz(
    page,
    request,
    JSON.stringify({
      format: "learn.v1",
      items: LIST_STEMS.map((stem, index) => ({
        ...FIXTURES.multiple_choice.canonical,
        id: `archive-list-${index}`,
        stem: { kind: "markdown", value: stem },
      })),
    }),
  );
  const items = page.getByRole("list", { name: "Questions" });
  const row = (stem: string) => items.getByRole("link", { name: new RegExp(`^${stem}`) });
  const [one, two, three] = LIST_STEMS as [string, string, string];
  for (const stem of LIST_STEMS) await expect(row(stem)).toBeVisible();

  // One row, from its own Archive: the confirm names how many, and nothing goes until it is used.
  await page.getByRole("button", { name: `Archive ${one}`, exact: true }).click();
  const confirmOne = page.getByRole("dialog", { name: "Archive 1 question?", exact: true });
  await expect(confirmOne).toBeVisible();
  await expectNoAxeViolations(page);
  await confirmOne.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Archived 1 question." })).toBeVisible();
  await expect(row(one)).toHaveCount(0);

  // Several at once: select two, then Archive selected.
  await page.getByRole("checkbox", { name: `Select ${two}`, exact: true }).check();
  await page.getByRole("checkbox", { name: `Select ${three}`, exact: true }).check();
  await page.getByRole("button", { name: "Archive selected", exact: true }).click();
  const confirmTwo = page.getByRole("dialog", { name: "Archive 2 questions?", exact: true });
  await confirmTwo.getByRole("button", { name: "Archive", exact: true }).click();
  const outcome = page.getByRole("status").filter({ hasText: "Archived 2 questions." });
  await expect(outcome).toBeVisible();
  await expect(row(two)).toHaveCount(0);
  await expect(row(three)).toHaveCount(0);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/bank-archived-from-list.png`,
    fullPage: true,
  });

  // The way back: Archived lists all three, and Restore brings one back.
  await outcome.getByRole("link", { name: "Show archived", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Archived questions" })).toBeVisible();
  for (const stem of LIST_STEMS) await expect(row(stem)).toBeVisible();
  await page.getByRole("button", { name: `Restore ${two}`, exact: true }).click();
  await expect(row(two)).toHaveCount(0);

  const views = page.getByRole("navigation", { name: "Current or archived" });
  await views.getByRole("link", { name: "Current", exact: true }).click();
  await expect(row(two)).toBeVisible();
  await expect(row(one)).toHaveCount(0);
  await expect(row(three)).toHaveCount(0);
});
