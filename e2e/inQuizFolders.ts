import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { insertAsAdmin, selectAsAdmin } from "./signIn";

/**
 * Since #411 a new quiz offers no folders inside it: its page shows folder controls only once it
 * has one, as quizzes made before #411 do. Specs about those controls give the open quiz its first
 * folder here, with the local secret key, the way such a quiz came to have one, then reload it.
 */
export async function giveQuizAnInQuizFolder(
  page: Page,
  request: APIRequestContext,
  name: string,
): Promise<void> {
  const bankId = new URL(page.url()).pathname.split("/").at(-1);
  const [bank] = await selectAsAdmin<{ org_id: string }>(
    request,
    "item_banks",
    `id=eq.${bankId}&select=org_id`,
  );
  if (!bank) throw new Error(`no quiz ${bankId} to give a folder`);
  await insertAsAdmin(request, "bank_folders", { bank_id: bankId, org_id: bank.org_id, name });
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Folders" }).getByRole("link", { name, exact: true }),
  ).toBeVisible();
}
