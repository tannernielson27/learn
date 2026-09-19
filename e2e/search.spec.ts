import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import { publishOpenItem } from "./authoringHelpers";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

const md = (value: string) => ({ kind: "markdown", value });
const mc = FIXTURES.multiple_choice.canonical;
const matrix = FIXTURES.matrix_multiple_choice.canonical;
const RISING = "Which findings suggest a rising lactate in septic shock?";

const fillers = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => ({
    ...mc,
    id: `search-filler-${from + index}`,
    stem: md(`Filler item ${from + index} about fluid balance`),
  }));

/**
 * Five items that mention lactate (in the stem, an option or the rationale) and 45 that do not;
 * then five more, since one import takes at most 50.
 */
function searchBank(): [string, string] {
  const first = [
    { ...matrix, id: "search-1", stem: md(RISING) },
    { ...matrix, id: "search-2", stem: md("Trend the serum lactate over the shift.") },
    { ...mc, id: "search-3", stem: md("Two lactates <b>were</b> drawn an hour apart.") },
    {
      ...mc,
      id: "search-4",
      stem: md("Search demo: which action comes first after the bolus?"),
      content: {
        options: mc.content.options.map((option, index) =>
          index === 0 ? { ...option, label: "Recheck the serum lactate" } : option,
        ),
      },
    },
    {
      ...mc,
      id: "search-5",
      stem: md("Search demo: which finding is the priority?"),
      rationale: { general: md("A lactate above 4 signals hypoperfusion.") },
    },
    ...fillers(1, 45),
  ];
  return [
    JSON.stringify({ format: "learn.v1", items: first }),
    JSON.stringify({ format: "learn.v1", items: fillers(46, 50) }),
  ];
}

const itemList = (page: Page) => page.getByRole("list", { name: "Items" });
// One per item; each item also lists its tags.
const rows = (page: Page) => itemList(page).locator(":scope > li");
const searchForm = (page: Page) => page.getByRole("search", { name: "Search items" });

async function search(page: Page, words: string) {
  await searchForm(page).getByRole("searchbox", { name: "Search items" }).fill(words);
  await searchForm(page).getByRole("button", { name: "Search" }).click();
}

test("an author searches a bank for lactate, then narrows to published Matrix Multiple Choice", async ({
  page,
  request,
}, testInfo) => {
  // Sign-in, a 55-item import, a publish and several searches: longer than the default.
  test.slow();
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const bankName = `Search ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/author");
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  const bankUrl = new URL(page.url()).pathname;

  for (const [index, payload] of searchBank().entries()) {
    await page.getByRole("textbox", { name: "Or paste JSON", exact: true }).fill(payload);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: index === 0 ? "Imported 50" : "Imported 5" }),
    ).toBeVisible();
  }

  // 55 items page at 50.
  const pages = page.getByRole("navigation", { name: "Pages" });
  await expect(pages).toContainText("Page 1 of 2");
  await expect(rows(page)).toHaveCount(50);
  await pages.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/\?page=2$/);
  await expect(rows(page)).toHaveCount(5);

  // Search: the stem, its plural, an option and the rationale all match.
  await search(page, "lactate");
  await expect(page).toHaveURL(/\?q=lactate&type=&status=$/);
  await expect(page.getByRole("status").filter({ hasText: "items match" })).toHaveText(
    "5 items match: “lactate”.",
  );
  await expect(rows(page)).toHaveCount(5);
  await expect(pages).toHaveCount(0);
  const rising = itemList(page).getByRole("link", { name: RISING });
  await expect(rising.locator("mark")).toHaveText(["lactate"]);
  await expect(
    itemList(page)
      .getByRole("link", { name: /^Two lactates/ })
      .locator("mark"),
  ).toHaveText(["lactates"]);
  // Item text is text: the stem's <b> never becomes an element.
  await expect(itemList(page).locator("b")).toHaveCount(0);
  await expect(
    itemList(page).getByRole("link", { name: /which action comes first/ }),
  ).toContainText("In the item: Recheck the serum lactate");
  await expect(
    itemList(page).getByRole("link", { name: /which finding is the priority/ }),
  ).toContainText("Matched in the rationale");

  // Publish one of the matrix items, then come back to the same search.
  await rising.click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit item" })).toBeVisible();
  await publishOpenItem(page);
  await page.goto(`${bankUrl}?q=lactate`);
  await expect(rows(page)).toHaveCount(5);

  // Narrow to Matrix Multiple Choice, published.
  await searchForm(page)
    .getByRole("combobox", { name: "Type" })
    .selectOption({ label: "Matrix Multiple Choice" });
  await searchForm(page).getByRole("combobox", { name: "Status" }).selectOption("published");
  await searchForm(page).getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\?q=lactate&type=matrix_multiple_choice&status=published$/);
  await expect(page.getByRole("status").filter({ hasText: "matches" })).toHaveText(
    "1 item matches: “lactate”, Matrix Multiple Choice, Published.",
  );
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText([RISING]);
  await expect(page.getByText("A type filter lists items only.")).toBeVisible();

  // The URL keeps the search.
  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await expect(searchForm(page).getByRole("searchbox", { name: "Search items" })).toHaveValue(
    "lactate",
  );
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/bank-search.png`,
    fullPage: true,
  });

  // Clearing the search shows the whole bank again.
  await searchForm(page).getByRole("link", { name: "Clear search" }).click();
  await expect(page).toHaveURL(new RegExp(`${bankUrl}$`));
  await expect(rows(page)).toHaveCount(50);
});
