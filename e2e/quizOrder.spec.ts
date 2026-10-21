import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { findRetiredTerms } from "../src/lib/copy/retiredTerms";
import { FIXTURES } from "../src/lib/ngn/fixtures";
import { openImport } from "./authoringHelpers";
import { drag } from "./drag";
import { selectAsAdmin, signInAsInstructorInEmptyOrg, updateAsAdmin } from "./signIn";

// #468: a teacher puts a quiz's questions in the order students meet them, with the arrows or by
// dragging, and a live session of the quiz runs them in that order. A teacher in a workspace of
// their own, so every list holds only what this spec makes. Needs the local Supabase stack, like
// auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

const STEMS = ["Order first", "Order second", "Order third"] as const;

/** Creates a quiz from the library and returns its id. */
async function createQuiz(page: Page, name: string): Promise<string> {
  await page.goto("/author");
  await page.getByRole("textbox", { name: "Quiz name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create quiz", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1) as string;
}

/** Imports one question per stem, in order, then publishes them with the local secret key. */
async function importPublished(
  page: Page,
  request: APIRequestContext,
  bankId: string,
): Promise<Map<string, string>> {
  const items = STEMS.map((value, index) => ({
    ...FIXTURES.multiple_choice.canonical,
    id: `order-${index + 1}`,
    stem: { kind: "markdown", value },
  }));
  await openImport(page);
  await page
    .getByRole("textbox", { name: "Or paste JSON", exact: true })
    .fill(JSON.stringify({ format: "learn.v1", items }));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Questions" }).getByRole("link", { name: STEMS[0] }),
  ).toBeVisible();
  const rows = await updateAsAdmin<{ id: string; content: { stem: { value: string } } }>(
    request,
    "items",
    `bank_id=eq.${bankId}`,
    { status: "published" },
  );
  return new Map(rows.map((row) => [row.content.stem.value, row.id]));
}

/** The stems as the Change order list shows them, top to bottom. */
async function orderShown(page: Page): Promise<string[]> {
  const list = page.getByRole("list", {
    name: "Questions and case studies in order",
    exact: true,
  });
  const labels: string[] = [];
  for (const row of await list.getByRole("listitem").all()) {
    const text = (await row.textContent()) ?? "";
    const stem = STEMS.find((candidate) => text.includes(candidate));
    if (stem) labels.push(stem);
  }
  return labels;
}

test("a teacher reorders three questions, and a live session runs them in that order", async ({
  page,
  request,
}, testInfo) => {
  test.slow();
  const project = testInfo.project.name;
  const shoot = (name: string) =>
    page.screenshot({ path: `test-results/screenshots/${project}/${name}.png`, fullPage: true });
  await signInAsInstructorInEmptyOrg(page, request, `order-${project}`);
  const quiz = await createQuiz(page, "Ordered quiz");
  const ids = await importPublished(page, request, quiz);

  // An import keeps the order of its file.
  await page.getByRole("link", { name: "Change order", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Change order", exact: true }),
  ).toBeVisible();
  expect(await orderShown(page)).toEqual([...STEMS]);
  await expect(page.getByRole("button", { name: "Save order", exact: true })).toBeDisabled();

  // The arrows: third to the top.
  await page.getByRole("button", { name: 'Move "Order third" up', exact: true }).click();
  await page.getByRole("button", { name: 'Move "Order third" up', exact: true }).click();
  expect(await orderShown(page)).toEqual(["Order third", "Order first", "Order second"]);
  await expect(page.getByText("Not saved yet.", { exact: true })).toBeVisible();

  // A drag by the grip: second above first.
  const list = page.getByRole("list", { name: "Questions and case studies in order", exact: true });
  const rowOf = (stem: string) => list.getByRole("listitem").filter({ hasText: stem });
  await drag(
    page,
    rowOf("Order second").locator('[aria-hidden="true"]').first(),
    rowOf("Order first"),
  );
  await expect.poll(() => orderShown(page)).toEqual(["Order third", "Order second", "Order first"]);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(findRetiredTerms(await page.locator("body").innerHTML(), await page.title())).toEqual([]);
  await shoot("quiz-order");

  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await expect(page.getByText("Order saved.", { exact: true })).toBeVisible();
  await page.reload();
  expect(await orderShown(page)).toEqual(["Order third", "Order second", "Order first"]);

  // The quiz page lists in that order too.
  await page.getByRole("link", { name: "Ordered quiz", exact: true }).click();
  const questions = page.getByRole("list", { name: "Questions", exact: true });
  await expect(questions.getByRole("link", { name: /^Order / })).toHaveText([
    /^Order third/,
    /^Order second/,
    /^Order first/,
  ]);

  // And a live session of the quiz runs them in that order.
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("join-code")).toBeVisible();
  const sessionId = new URL(page.url()).pathname.split("/").at(-1);
  const [session] = await selectAsAdmin<{ item_set: string[] }>(
    request,
    "sessions",
    `id=eq.${sessionId}&select=item_set`,
  );
  expect(session?.item_set).toEqual([
    ids.get("Order third"),
    ids.get("Order second"),
    ids.get("Order first"),
  ]);
});
