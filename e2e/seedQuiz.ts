import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { importRowsFor, parseImport } from "../src/lib/authoring/transfer";
import type { ItemRow } from "../src/lib/supabase/itemRows";
import { insertAsAdmin, insertManyAsAdmin, selectAsAdmin } from "./signIn";

/**
 * Puts learn.v1 content (docs/transfer-format.md) into the open quiz with the local secret key, for
 * specs whose subject is not how questions get there. The quiz page had an Import JSON form until
 * the owner removed it; this writes the rows import_bank_content wrote: each item a new id that its
 * content carries too, version 1, a draft, Unfiled, created by the quiz's teacher, in the order
 * given; a case study a draft with its six steps pinned to their positions. Then it reloads.
 */
export async function seedQuiz(
  page: Page,
  request: APIRequestContext,
  learnJson: string,
): Promise<void> {
  const parsed = parseImport(learnJson);
  if (!parsed.ok) throw new Error(`not a valid learn.v1 payload: ${parsed.errors.join(" ")}`);
  const rows = importRowsFor(parsed);

  const bankId = new URL(page.url()).pathname.split("/").at(-1);
  const [bank] = await selectAsAdmin<{ org_id: string; created_by: string | null }>(
    request,
    "item_banks",
    `id=eq.${bankId}&select=org_id,created_by`,
  );
  if (!bank) throw new Error(`no quiz ${bankId} to seed`);

  const itemRow = (row: ItemRow) => {
    const id = randomUUID();
    return {
      ...row,
      id,
      bank_id: bankId,
      org_id: bank.org_id,
      folder_id: null,
      version: 1,
      status: "draft",
      content: { ...(row.content as Record<string, unknown>), id },
      created_by: bank.created_by,
    };
  };

  // One row at a time, as the import wrote them, so each lands at the end of the quiz in order.
  for (const row of rows.items) await insertAsAdmin(request, "items", itemRow(row));

  if (rows.caseStudy) {
    const { title, tags, ehr, items } = rows.caseStudy;
    const study = await insertAsAdmin<{ id: string }>(request, "case_studies", {
      bank_id: bankId,
      org_id: bank.org_id,
      folder_id: null,
      title,
      tags,
      ehr,
      status: "draft",
      created_by: bank.created_by,
    });
    const steps = items.map(itemRow);
    for (const step of steps) await insertAsAdmin(request, "items", step);
    await insertManyAsAdmin(
      request,
      "case_study_items",
      steps.map((step, index) => ({
        case_study_id: study.id,
        org_id: bank.org_id,
        bank_id: bankId,
        position: index + 1,
        item_id: step.id,
      })),
    );
  }

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
