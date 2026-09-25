import { expect, test, type Page } from "@playwright/test";
import { latestSignInLink } from "./mailbox";
import {
  accessTokenFor,
  insertAsAdmin,
  insertManyAsAdmin,
  rpcAsAdmin,
  rpcAsUser,
  selectAsAdmin,
  signInAsNewAuthor,
} from "./signIn";

// #273: the student home's "Your steps" (#239, #241) on a real page, against seeded marks: ranked
// steps weakest first, a step under five items reads "Not enough answers yet", and a step with
// marks from both sources shows its assignment and practice counts apart. Needs the local Supabase
// stack; CI runs it in the `auth-e2e` job.
//
// Everything is seeded for this test's own student, class and bank, so no other spec sees it. The
// marks are written through the same functions the app uses: the student's own start and save
// (with their token), then the service role's record, which takes the score. The database refuses
// an assignment created already closed (private.snapshot_assignment) and refuses the service role
// any direct write to attempts, so the assignment gets a window of seconds, created before the
// student joins; the join and the seeding run inside it, and only the remainder is waited out.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

/** Long enough for the student to join and the attempt to be seeded; short enough to wait out. */
const WINDOW_MS = 25_000;
/** #208's two seconds of grace after the close, and a second for clocks. */
const GRACE_MS = 3_000;

type Step = 1 | 2 | 3 | 4 | 5 | 6;

/** Each seeded item: its step, where it is answered, and the points it earned out of 1. */
interface Seed {
  step: Step;
  source: "assignment" | "practice";
  points: 0 | 1;
}

// Generate Solutions: 6 items, 2 of 6 = 33%, 3 from each source.
// Recognize Cues: 5 practice items, 3 of 5 = 60%.
// Analyze Cues: 5 assignment items, 4 of 5 = 80%.
// Evaluate Outcomes: 2 assignment items, both right, but under five: not ranked.
// Prioritize Hypotheses and Take Action: nothing.
// Ranked weakest first is 4, 1, 2: not the model's order, so a sort that did nothing would fail.
const SEEDS: readonly Seed[] = [
  ...([1, 0, 0] as const).map((points) => ({
    step: 4 as const,
    source: "assignment" as const,
    points,
  })),
  ...([1, 0, 0] as const).map((points) => ({
    step: 4 as const,
    source: "practice" as const,
    points,
  })),
  ...([1, 1, 1, 0, 0] as const).map((points) => ({
    step: 1 as const,
    source: "practice" as const,
    points,
  })),
  ...([1, 1, 1, 1, 0] as const).map((points) => ({
    step: 2 as const,
    source: "assignment" as const,
    points,
  })),
  ...([1, 1] as const).map((points) => ({
    step: 6 as const,
    source: "assignment" as const,
    points,
  })),
];

/** A published multiple choice worth one point, tagged with a step. Fictional content. */
function itemRow(orgId: string, bankId: string, step: Step, index: number) {
  return {
    org_id: orgId,
    bank_id: bankId,
    type: "multiple_choice",
    cjmm_step: step,
    status: "published",
    content: {
      id: `steps_e2e_${index}`,
      stem: { kind: "markdown", value: `Steps e2e item ${index}: which action comes first?` },
      meta: {},
      content: {
        options: [
          { id: "opt_a", label: "Assess the client" },
          { id: "opt_b", label: "Document and wait" },
        ],
      },
    },
    answer_key: { correctOptionId: "opt_a" },
    rationale: {},
    scoring: { model: "zero_one", maxPoints: 1 },
  };
}

async function createClass(page: Page, name: string): Promise<{ id: string; invite: string }> {
  await page.getByRole("link", { name: "Classes", exact: true }).click();
  await page.getByRole("textbox", { name: "Class name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(page).toHaveURL(/\/author\/classes\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1) as string;
  const invite = await page.getByRole("textbox", { name: "Invite link", exact: true }).inputValue();
  return { id, invite };
}

test("Your steps ranks the weakest step first and counts assignments and practice apart", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const project = testInfo.project.name;
  const shot = (name: string) => `test-results/screenshots/${project}/${name}.png`;

  // An instructor and a class; the org is the one the class is in.
  await signInAsNewAuthor(page, request, `steps-${project}`);
  const klass = await createClass(page, `NUR 410 ${Date.now() % 100_000}`);
  const [classRow] = await selectAsAdmin<{ org_id: string }>(
    request,
    "classes",
    `id=eq.${klass.id}&select=org_id`,
  );
  if (!classRow) throw new Error("no class");
  const orgId = classRow.org_id;

  // This test's own bank, its step-tagged items, shared for practice with this class only.
  const bank = await insertAsAdmin<{ id: string }>(request, "item_banks", {
    org_id: orgId,
    name: `Steps e2e ${project} ${Date.now()}`,
  });
  const items = await insertManyAsAdmin<{ id: string }>(
    request,
    "items",
    SEEDS.map((seed, index) => itemRow(orgId, bank.id, seed.step, index)),
  );
  const seeded = SEEDS.map((seed, index) => ({
    ...seed,
    itemId: (items[index] as { id: string }).id,
  }));
  await insertAsAdmin(request, "bank_practice_shares", {
    org_id: orgId,
    bank_id: bank.id,
    class_id: klass.id,
  });

  // The assignment's window starts now, so the join below runs inside it.
  const closesAt = Date.now() + WINDOW_MS;
  const assignment = await insertAsAdmin<{ id: string }>(request, "assignments", {
    org_id: orgId,
    class_id: klass.id,
    bank_id: bank.id,
    title: `Steps ${project}`,
    opens_at: new Date(Date.now() - 60_000).toISOString(),
    closes_at: new Date(closesAt).toISOString(),
    max_attempts: 1,
    shuffle_options: false,
  });

  // A student on a phone joins from the invite link.
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const phone = await browser.newContext({ viewport, isMobile, hasTouch, reducedMotion: "reduce" });
  const student = await phone.newPage();
  await student.goto(klass.invite);
  const email = `student-steps-${project}-${Date.now()}@example.test`;
  const since = new Date();
  await student.getByRole("textbox", { name: "Email address", exact: true }).fill(email);
  await student.getByRole("button", { name: "Email me a link to join", exact: true }).click();
  await student.goto(await latestSignInLink(request, email, since));
  await expect(student).toHaveURL(/\/learn$/);
  const [member] = await selectAsAdmin<{ profile_id: string }>(
    request,
    "class_members",
    `class_id=eq.${klass.id}&select=profile_id`,
  );
  if (!member) throw new Error("the student did not join");
  const studentId = member.profile_id;

  // The assignment: started and saved as the student, then scored by the service role.
  const token = await accessTokenFor(request, studentId, email);
  const [started] = await rpcAsUser<{ refusal: string | null; attempt_id: string | null }[]>(
    request,
    token,
    "start_assignment_attempt",
    { target_assignment: assignment.id },
  );
  expect(started?.refusal ?? null).toBeNull();
  const attemptId = started?.attempt_id as string;
  const answered = seeded.filter((seed) => seed.source === "assignment");
  for (const seed of answered) {
    const [saved] = await rpcAsUser<{ refusal: string | null }[]>(
      request,
      token,
      "save_attempt_response",
      { target_attempt: attemptId, target_item: seed.itemId, answer: { optionId: "opt_a" } },
    );
    expect(saved?.refusal ?? null).toBeNull();
  }
  const [begun] = await rpcAsUser<{ refusal: string | null; revision: number }[]>(
    request,
    token,
    "begin_attempt_submission",
    { target_attempt: attemptId },
  );
  expect(begun?.refusal ?? null).toBeNull();
  const [recorded] = await rpcAsAdmin<{ refusal: string | null }[]>(
    request,
    "record_attempt_submission",
    {
      target_attempt: attemptId,
      student: studentId,
      expected_revision: begun?.revision,
      total: answered.reduce((sum, seed) => sum + seed.points, 0),
      possible: answered.length,
      marks: answered.map((seed) => ({
        item_id: seed.itemId,
        points: seed.points,
        max_points: 1,
        model: "zero_one",
        breakdown: [],
      })),
      automatic: false,
    },
  );
  expect(recorded?.refusal ?? null).toBeNull();

  // Practice: one run, each practice item's first (and only) answer. Practice has no window.
  const [run] = await rpcAsAdmin<{ run_id: string }[]>(request, "open_practice_run", {
    student: studentId,
    target_bank: bank.id,
    fresh: true,
  });
  if (!run) throw new Error("no practice run");
  for (const seed of seeded.filter((entry) => entry.source === "practice")) {
    const outcome = await rpcAsAdmin<string>(request, "record_practice_response", {
      student: studentId,
      target_run: run.run_id,
      target_item: seed.itemId,
      answer: { optionId: seed.points === 1 ? "opt_a" : "opt_b" },
      earned: seed.points,
      possible: 1,
      marks: { earned: seed.points, possible: 1 },
    });
    expect(outcome).toBe("recorded");
  }

  // If the seeding reached the close, the open-state check below would prove nothing.
  expect(Date.now(), "the window closed before the open-state check ran").toBeLessThan(
    closesAt - 2_000,
  );

  const steps = student.getByRole("list", { name: "Your clinical judgment steps", exact: true });
  const rows = steps.getByRole("listitem");
  const row = (label: string) =>
    rows.filter({ has: student.getByRole("heading", { level: 3, name: label, exact: true }) });

  // Still open: practice counts already, the open assignment's marks do not.
  await student.goto("/learn");
  await expect(row("Recognize Cues")).toContainText("5 items");
  await expect(row("Analyze Cues")).toContainText("No answers yet");
  await expect(row("Generate Solutions")).toContainText("Not enough answers yet (3 items)");

  // After the close (and its grace): the assignment's marks join the ranking.
  await student.waitForTimeout(Math.max(0, closesAt + GRACE_MS - Date.now()));
  await student.goto("/learn");
  await expect(rows).toHaveCount(6);
  await expect(rows.getByRole("heading", { level: 3 })).toHaveText([
    "Generate Solutions",
    "Recognize Cues",
    "Analyze Cues",
    "Prioritize Hypotheses",
    "Take Action",
    "Evaluate Outcomes",
  ]);

  // Ranked, weakest first, each with its percent; the mixed step counts its sources apart.
  await expect(row("Generate Solutions")).toContainText("33%");
  await expect(
    row("Generate Solutions").getByText("6 items: 3 from assignments, 3 from practice", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(row("Recognize Cues")).toContainText("60%");
  await expect(row("Recognize Cues").getByText("5 items", { exact: true })).toBeVisible();
  await expect(row("Analyze Cues")).toContainText("80%");
  await expect(row("Analyze Cues").getByText("5 items", { exact: true })).toBeVisible();

  // Under five items: no percent, however well it went.
  const evaluate = row("Evaluate Outcomes");
  await expect(
    evaluate.getByText("Not enough answers yet (2 items)", { exact: true }),
  ).toBeVisible();
  await expect(evaluate).not.toContainText("%");
  for (const label of ["Prioritize Hypotheses", "Take Action"]) {
    await expect(row(label).getByText("No answers yet", { exact: true })).toBeVisible();
  }

  await student
    .getByRole("region", { name: "Your steps", exact: true })
    .screenshot({ path: shot("student-steps-ranked") });
  await phone.close();
});
