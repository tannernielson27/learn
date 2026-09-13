import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInAsNewAuthor } from "./signIn";

// Needs the local Supabase stack, like auth.spec.ts. CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("an author creates a bank, starts an item by type, and finds the draft in the bank", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  await expect(page.getByRole("heading", { level: 1, name: "Item banks" })).toBeVisible();
  await expectNoAxeViolations(page);

  const bankName = `Cardiac ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole("textbox", { name: "Bank name" }).fill(bankName);
  await page.getByRole("button", { name: "Create bank" }).click();

  await expect(page.getByRole("heading", { level: 1, name: bankName })).toBeVisible();
  await expect(
    page.getByText("No items in this bank yet. Choose New item to write one."),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("link", { name: "New item" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New item" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bowtie" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Extended Multiple Response" }).click();
  await expect(page).toHaveURL(/\/author\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Extended Multiple Response")).toBeVisible();

  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(page.getByRole("link", { name: /Untitled item/ })).toContainText("Draft");

  await page.getByRole("link", { name: "Item banks" }).click();
  await expect(page.getByRole("link", { name: new RegExp(bankName) })).toContainText("1 item");
});

test("an author writes a multiple choice item beside its preview, saves a draft, then publishes", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  await page
    .getByRole("textbox", { name: "Bank name" })
    .fill(`Editor ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create bank" }).click();
  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/items\/[0-9a-f-]{36}$/);

  const problems = page.getByRole("region", { name: "Problems to fix" });
  await expect(problems.getByRole("button", { name: "Write the question stem." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  await page
    .getByRole("textbox", { name: "Question stem" })
    .fill("Which action should the nurse take first?");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();

  const preview = page.getByRole("region", { name: "Preview" });
  const answers = [
    "Assess the airway",
    "Call the provider",
    "Document the finding",
    "Reassess in an hour",
  ];
  for (const [index, text] of answers.entries()) {
    // Exact: Playwright matches names by substring, and "Why option A is right or wrong" contains
    // "option A".
    await page.getByRole("textbox", { name: `Option ${"ABCD"[index]}`, exact: true }).fill(text);
  }
  await page.getByRole("radio", { name: "Option A is correct" }).check();
  await expect(preview.getByText("Which action should the nurse take first?")).toBeVisible();
  await expect(preview.getByText("Assess the airway")).toBeVisible();
  await expect(problems).toHaveCount(0);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

  await page.getByRole("link", { name: "Back to bank" }).click();
  // Anchored: a published item also has a link named "Play <stem>".
  const editLink = page.getByRole("link", { name: /^Which action should the nurse take first\?/ });
  await expect(editLink).toContainText("Published");

  // A reload opens exactly what was published.
  await editLink.click();
  await expect(page.getByRole("textbox", { name: "Option C", exact: true })).toHaveValue(
    "Document the finding",
  );
  await expect(page.getByRole("radio", { name: "Option A is correct" })).toBeChecked();

  // Play it from the bank: the page carries no key, and the server scores the answer.
  await page.getByRole("link", { name: "Back to bank" }).click();
  await page.getByRole("link", { name: "Play Which action should the nurse take first?" }).click();
  await expect(page).toHaveURL(/\/author\/items\/[0-9a-f-]{36}\/play$/);
  await expect(page.getByRole("heading", { level: 1, name: "Play item" })).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain("correctOptionId");
  expect(html).not.toContain("answerKey");
  await expectNoAxeViolations(page);

  const scored = page.waitForResponse(
    (response) => response.url().endsWith("/play/score") && response.request().method() === "POST",
  );
  await page.getByRole("radio", { name: /Assess the airway/ }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  expect((await scored).status()).toBe(200);
  const score = page.getByRole("complementary", { name: "Score" });
  await expect(score).toBeVisible();
  await expect(score).toContainText("1");
  await expect(score).toBeFocused();
  await expectNoAxeViolations(page);

  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/play-from-bank-scored.png`,
    fullPage: true,
  });
});

test("an author writes a select-all-that-apply item, marks three answers, and publishes", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  await page
    .getByRole("textbox", { name: "Bank name" })
    .fill(`SATA ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create bank" }).click();
  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Extended Multiple Response", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/items\/[0-9a-f-]{36}$/);

  const problems = page.getByRole("region", { name: "Problems to fix" });
  await expect(
    problems.getByRole("button", { name: "Mark at least one option as correct." }),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "Question stem" })
    .fill("Which findings require immediate follow-up?");
  const findings = [
    "Respiratory rate 28",
    "Oxygen saturation 89%",
    "Temperature 37.2 °C",
    "New confusion",
    "Productive cough",
  ];
  for (const [index, text] of findings.entries()) {
    const letter = "ABCDE"[index];
    await page.getByRole("textbox", { name: `Option ${letter}`, exact: true }).fill(text);
  }
  for (const letter of ["A", "B", "D"]) {
    await page.getByRole("checkbox", { name: `Option ${letter} is correct` }).check();
  }

  const preview = page.getByRole("region", { name: "Preview" });
  await expect(preview.getByText("Oxygen saturation 89%").first()).toBeVisible();
  await expect(problems).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(
    page.getByRole("link", { name: /^Which findings require immediate follow-up\?/ }),
  ).toContainText("Published");
});

test("an author writes a matrix item, marks one column per row, and publishes", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  await page
    .getByRole("textbox", { name: "Bank name" })
    .fill(`Matrix ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create bank" }).click();
  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Matrix Multiple Choice", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/items\/[0-9a-f-]{36}$/);

  const problems = page.getByRole("region", { name: "Problems to fix" });
  await expect(
    problems.getByRole("button", { name: "Choose the correct column for row 1." }),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "Question stem" })
    .fill("For each finding, indicate whether the client's condition has improved or declined.");
  await page.getByRole("textbox", { name: "Column 1", exact: true }).fill("Improved");
  await page.getByRole("textbox", { name: "Column 2", exact: true }).fill("Declined");

  const findings = [
    { text: "Oxygen saturation 96% on room air", answer: "Improved" },
    { text: "Respiratory rate 32 breaths/min", answer: "Declined" },
  ];
  for (const [index, finding] of findings.entries()) {
    const row = page.getByRole("group", { name: `Row ${index + 1}`, exact: true });
    await row.getByRole("textbox", { name: "Row text" }).fill(finding.text);
    await row
      .getByRole("radiogroup", { name: `Correct column for row ${index + 1}` })
      .getByRole("radio", { name: finding.answer })
      .check();
  }

  const preview = page.getByRole("region", { name: "Preview" });
  // The matrix player renders both a grid (hidden on phones) and row cards (hidden on wider
  // screens), so check a visible copy rather than whichever comes first.
  await expect(
    preview.getByText("Oxygen saturation 96% on room air").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(problems).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(
    page.getByRole("link", { name: /^For each finding, indicate whether/ }),
  ).toContainText("Published");
});

test("an author writes a highlight item, marks phrases, publishes, and plays it", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  await page
    .getByRole("textbox", { name: "Bank name" })
    .fill(`Highlight ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create bank" }).click();
  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Highlight Text", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/items\/[0-9a-f-]{36}$/);

  const problems = page.getByRole("region", { name: "Problems to fix" });
  await expect(problems.getByRole("button", { name: "Write the passage." })).toBeVisible();

  // Mark span wraps a real selection in the passage.
  const passage = page.getByRole("textbox", { name: "Passage" });
  await passage.fill("Pulse 120 today");
  await passage.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(6, 9));
  await page.getByRole("button", { name: "Mark span" }).click();
  await expect(passage).toHaveValue("Pulse [[120|span_1]] today");

  const stem = "Highlight the findings that need follow-up.";
  await page.getByRole("textbox", { name: "Question stem" }).fill(stem);
  await passage.fill(
    "0800: [[Heart rate 118|hr]]; [[skin warm and dry|skin]]; client reports [[new confusion|conf]].",
  );
  await page.getByRole("checkbox", { name: "Heart rate 118 is correct" }).check();
  await page.getByRole("checkbox", { name: "new confusion is correct" }).check();

  const preview = page.getByRole("region", { name: "Preview" });
  await expect(preview.getByRole("button", { name: "Heart rate 118" })).toBeVisible();
  await expect(problems).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

  await page.getByRole("link", { name: "Back to bank" }).click();
  await expect(page.getByRole("link", { name: /^Highlight the findings that need/ })).toContainText(
    "Published",
  );
  await page.getByRole("link", { name: `Play ${stem}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Play item" })).toBeVisible();
  expect(await page.content()).not.toContain("correctSpanIds");

  await page.getByRole("button", { name: "Heart rate 118" }).click();
  await page.getByRole("button", { name: "new confusion" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  const score = page.getByRole("complementary", { name: "Score" });
  await expect(score).toContainText("2");
  await expect(score).toBeFocused();
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/highlight-from-bank-scored.png`,
    fullPage: true,
  });
});

test("an author writes a drag-and-drop rationale item from a word bank, publishes, and plays it", async ({
  page,
  request,
}, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  await page
    .getByRole("textbox", { name: "Bank name" })
    .fill(`Drag ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create bank" }).click();
  await page.getByRole("link", { name: "New item" }).click();
  await page.getByRole("button", { name: "Drag-and-Drop Rationale", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/items\/[0-9a-f-]{36}$/);

  const problems = page.getByRole("region", { name: "Problems to fix" });
  await expect(problems.getByRole("button", { name: "Word 1 needs text." })).toBeVisible();

  const stem = "An older adult started a new diuretic and uses a walker for the first time.";
  await page.getByRole("textbox", { name: "Question stem" }).fill(stem);
  const sentence = page.getByRole("textbox", { name: "Sentence" });
  await sentence.fill("The client is at risk for {{blank_1}} as evidenced by ");
  await sentence.evaluate((element: HTMLTextAreaElement) =>
    element.setSelectionRange(element.value.length, element.value.length),
  );
  await page.getByRole("button", { name: "Insert blank" }).click();
  await expect(sentence).toHaveValue(
    "The client is at risk for {{blank_1}} as evidenced by {{blank_2}}",
  );

  const words = ["falls", "a new walker", "infection", "a rash"];
  for (const [index, word] of words.entries()) {
    await page.getByRole("textbox", { name: `Word ${index + 1}`, exact: true }).fill(word);
  }
  await page
    .getByRole("combobox", { name: "Correct word for blank 1" })
    .selectOption({ label: "falls" });
  await page
    .getByRole("combobox", { name: "Correct word for blank 2" })
    .selectOption({ label: "a new walker" });

  const preview = page.getByRole("region", { name: "Preview" });
  await expect(
    preview.getByRole("group", { name: "Word bank" }).getByRole("button", { name: "falls" }),
  ).toBeVisible();
  await expect(problems).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

  await page.getByRole("link", { name: "Back to bank" }).click();
  await page.getByRole("link", { name: `Play ${stem}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Play item" })).toBeVisible();
  expect(await page.content()).not.toContain("correctTokenId");

  // Tap to place: choose a word, then the blank it fills.
  const bank = page.getByRole("group", { name: "Word bank" });
  await bank.getByRole("button", { name: "falls" }).click();
  await page.getByRole("button", { name: "Blank 1 of 2, empty" }).click();
  await bank.getByRole("button", { name: "a new walker" }).click();
  await page.getByRole("button", { name: "Blank 2 of 2, empty" }).click();
  await page.getByRole("button", { name: "Submit" }).click();

  const score = page.getByRole("complementary", { name: "Score" });
  await expect(score).toContainText("1");
  await expect(score).toBeFocused();
  await expectNoAxeViolations(page);
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}/dragdrop-from-bank-scored.png`,
    fullPage: true,
  });
});

test("an unknown bank is a not-found page, not an error", async ({ page, request }, testInfo) => {
  await signInAsNewAuthor(page, request, testInfo.project.name);
  const response = await page.goto("/author/banks/00000000-0000-4000-8000-00000000dead");
  expect(response?.status()).toBe(404);
  const malformed = await page.goto("/author/banks/not-a-bank");
  expect(malformed?.status()).toBe(404);
});
