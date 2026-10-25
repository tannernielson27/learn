import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  createAccountWithoutRole,
  insertAsAdmin,
  rpcAsAdmin,
  selectAsAdmin,
  signInAsInstructorInEmptyOrg,
  signInAsNewAuthor,
  uniqueEmail,
  updateAsAdmin,
} from "./signIn";

// A class's progress: the teacher starts a live session from the class header, a member is in it
// and another member is not, and after it ends the Progress tab shows who attended and the
// student's own page links to the session's report. A teacher of another workspace gets
// not-found for that student. Needs the local Supabase stack; CI runs it in the `auth-e2e` job.
test.skip(process.env.E2E_AUTH !== "1", "set E2E_AUTH=1 with the local Supabase stack running");

// The seeded "Samples" bank (supabase/seed.sql), in the first workspace, which is the one
// signInAsNewAuthor makes the teacher an instructor in.
const SAMPLES_BANK = "00000000-0000-4000-8000-000000000002";
const CLASS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A class written with the local secret key, as classLiveSession.spec.ts writes one. */
async function makeClass(request: APIRequestContext, orgId: string, name: string) {
  const code = Array.from(
    randomBytes(8),
    (byte) => CLASS_CODE_ALPHABET[byte % CLASS_CODE_ALPHABET.length],
  ).join("");
  return insertAsAdmin<{ id: string }>(request, "classes", {
    org_id: orgId,
    name,
    invite_token: randomBytes(24).toString("base64url"),
    join_code: code,
  });
}

/** A student of `orgId` on the class's roster. They never need to sign in here. */
async function member(request: APIRequestContext, orgId: string, classId: string, name: string) {
  const userId = await createAccountWithoutRole(request, uniqueEmail("class-progress"));
  await updateAsAdmin(request, "profiles", `id=eq.${userId}`, {
    org_id: orgId,
    role: "student",
    display_name: name,
  });
  await insertAsAdmin(request, "class_members", { class_id: classId, profile_id: userId });
  return userId;
}

test("a class's progress shows who attended, and a student's page links to the report", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.slow();
  const stamp = `${testInfo.project.name} ${Date.now() % 1_000_000}`;
  await signInAsNewAuthor(page, request, testInfo.project.name);

  const [samples] = await selectAsAdmin<{ org_id: string; name: string }>(
    request,
    "item_banks",
    `id=eq.${SAMPLES_BANK}&select=org_id,name`,
  );
  if (!samples) throw new Error("the seeded Samples bank is missing");
  const className = `NUR 330 ${stamp}`;
  const madeClass = await makeClass(request, samples.org_id, className);
  const present = `Mia Chen ${Date.now() % 10_000}`;
  const absent = `Noor Ali ${Date.now() % 10_000}`;
  const presentId = await member(request, samples.org_id, madeClass.id, present);
  await member(request, samples.org_id, madeClass.id, absent);

  // 1. Nothing yet: the Progress tab says how to run a live session for the class.
  await page.goto(`/author/classes/${madeClass.id}?tab=progress`);
  await expect(
    page.getByRole("heading", { name: "No live sessions or assignments yet", exact: true }),
  ).toBeVisible();

  // 2. "Start a live session" in the class header: choose the quiz, and it starts for the class.
  await page.getByRole("link", { name: "Start a live session", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/author/classes/${madeClass.id}/start$`));
  await page.getByRole("combobox", { name: "Quiz", exact: true }).selectOption(SAMPLES_BANK);
  await page.getByRole("button", { name: "Start a live session", exact: true }).click();
  await expect(page).toHaveURL(/\/live\/[0-9a-f-]{36}$/);
  const sessionId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  const [session] = await selectAsAdmin<{ class_id: string | null; title: string }>(
    request,
    "sessions",
    `id=eq.${sessionId}&select=class_id,title`,
  );
  expect(session?.class_id).toBe(madeClass.id);

  // 3. One member joins, as the join action would join them, signed in; the other never does.
  await rpcAsAdmin(request, "join_session", {
    target_session: sessionId,
    chosen_name: present,
    joining_profile: presentId,
  });
  await page.getByRole("button", { name: "End live session", exact: true }).click();
  await page.getByRole("button", { name: "End live session", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open the report", exact: true })).toBeVisible();

  // 4. Progress: attended once, and absent once, said in words in each cell.
  await page.goto(`/author/classes/${madeClass.id}?tab=progress`);
  const grid = page.getByRole("region", { name: "Progress by student", exact: true });
  const presentRow = grid.getByRole("row", { name: new RegExp(present) });
  await expect(presentRow.getByRole("cell").nth(1)).toHaveText("1 of 1");
  await expect(presentRow.getByTestId("progress-cell")).toHaveText("Joined");
  const absentRow = grid.getByRole("row", { name: new RegExp(absent) });
  await expect(absentRow.getByRole("cell").nth(1)).toHaveText("0 of 1");
  await expect(absentRow.getByTestId("progress-cell")).toHaveText("Absent");

  // The Live sessions tab lists it, opening its report.
  await page.goto(`/author/classes/${madeClass.id}?tab=sessions`);
  await expect(
    page
      .getByRole("list", { name: "Live sessions", exact: true })
      .getByRole("link", { name: new RegExp(session?.title ?? "") }),
  ).toHaveAttribute("href", `/live/${sessionId}/report`);

  // 5. The student's own page, from the grid.
  await page.goto(`/author/classes/${madeClass.id}?tab=progress`);
  await grid.getByRole("link", { name: present, exact: true }).click();
  const studentPath = `/author/classes/${madeClass.id}/students/${presentId}`;
  await expect(page).toHaveURL(new RegExp(`${studentPath}$`));
  await expect(page.getByRole("heading", { level: 1, name: present, exact: true })).toBeVisible();
  await expect(page.getByTestId("timeline-result")).toHaveText(["Joined"]);
  await expect(
    page.getByRole("link", {
      name: `Open the live session report: ${session?.title ?? ""}`,
      exact: true,
    }),
  ).toHaveAttribute("href", `/live/${sessionId}/report`);

  // 6. A teacher of another workspace: not-found, and nothing of the student's.
  const other = await (await browser.newContext()).newPage();
  await signInAsInstructorInEmptyOrg(other, request, `progress-other-${testInfo.project.name}`);
  const response = await other.goto(studentPath);
  expect(response?.status()).toBe(404);
  await expect(other.getByText(present, { exact: true })).toHaveCount(0);
  await other.context().close();
});
