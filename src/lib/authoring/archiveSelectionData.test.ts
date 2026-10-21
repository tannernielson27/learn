import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { ARCHIVE_SELECTION_ERRORS } from "./archiveSelection";
import { archiveSelection } from "./archiveSelectionData";
import { RATE_LIMIT_ERRORS } from "./rateLimit";

const BANK = "6e4d4a8f-2b3c-4d5e-9f60-1b2c3d4e5f01";
const DRAFT = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a01";
const PUBLISHED = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a02";
const STEP = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a03";
const DONE = "7f5e5b90-3c4d-4e6f-8a71-2c3d4e5f6a04";
const CASE = "8a6f6ca1-4d5e-4f70-9b82-3d4e5f6a7b01";

interface Call {
  table: string;
  steps: [string, unknown[]][];
}
type Result = { data?: unknown; error?: { code?: string } | null };

function fakeClient(answer: (call: Call) => Result) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, steps: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
          const result = answer(call);
          return Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(
            resolve,
            reject,
          );
        },
      };
      for (const step of ["select", "update", "eq", "in"]) {
        builder[step] = (...args: unknown[]) => {
          call.steps.push([step, args]);
          return builder;
        };
      }
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

const has = (call: Call, step: string) => call.steps.some(([name]) => name === step);
const arg = (call: Call, step: string, at = 0) =>
  call.steps.filter(([name]) => name === step)[at]?.[1];
const isUpdate = (call: Call) => has(call, "update");

const ROWS = [
  { id: DRAFT, status: "draft", stem: { kind: "markdown", value: "Draft one" } },
  { id: PUBLISHED, status: "published", stem: { kind: "markdown", value: "Published one" } },
  { id: STEP, status: "published", stem: { kind: "markdown", value: "Which finding" } },
  { id: DONE, status: "archived", stem: null },
];

describe("archiveSelection", () => {
  it("archives each status in one write, keeps a step and says why", async () => {
    const { client, calls } = fakeClient((call) => {
      if (call.table === "items" && !isUpdate(call)) return { data: ROWS };
      if (call.table === "case_study_items") {
        return { data: [{ item_id: STEP, position: 2, case_studies: { title: "Mr. Lee" } }] };
      }
      if (call.table === "items") {
        const status = (arg(call, "eq", 1) as unknown[])[1];
        return { data: status === "draft" ? [{ id: DRAFT }] : [{ id: PUBLISHED }] };
      }
      return { data: [] };
    });
    const result = await archiveSelection(client, BANK, {
      itemIds: [DRAFT, PUBLISHED, STEP, DONE],
      caseStudyIds: [],
    });
    expect(result).toEqual({
      archived: { items: 2, caseStudies: 0 },
      refusals: [
        '"Which finding" is step 2 of the case study "Mr. Lee", so it stays. Archive the case study instead, or give that step another question first.',
      ],
    });

    const [read, steps, ...writes] = calls;
    expect(arg(read!, "eq")).toEqual(["bank_id", BANK]);
    // Only the rows not yet archived are asked about as steps.
    expect(arg(steps!, "in")).toEqual(["item_id", [DRAFT, PUBLISHED, STEP]]);
    expect(writes).toHaveLength(2);
    const draftWrite = writes.find((call) => (arg(call, "eq", 1) as unknown[])[1] === "draft")!;
    expect(arg(draftWrite, "update")).toEqual([{ status: "archived", archived_from: "draft" }]);
    expect(arg(draftWrite, "eq")).toEqual(["bank_id", BANK]);
    expect(arg(draftWrite, "in")).toEqual(["id", [DRAFT]]);
    const publishedWrite = writes.find((call) => call !== draftWrite)!;
    expect(arg(publishedWrite, "update")).toEqual([
      { status: "archived", archived_from: "published" },
    ]);
    // The step never reaches the write: the trigger would refuse the whole statement.
    expect(arg(publishedWrite, "in")).toEqual(["id", [PUBLISHED]]);
  });

  it("archives case studies the same way, without a step check", async () => {
    const { client, calls } = fakeClient((call) => {
      if (!isUpdate(call)) return { data: [{ id: CASE, status: "draft" }] };
      return { data: [{ id: CASE }] };
    });
    expect(await archiveSelection(client, BANK, { itemIds: [], caseStudyIds: [CASE] })).toEqual({
      archived: { items: 0, caseStudies: 1 },
      refusals: [],
    });
    expect(calls.map((call) => call.table)).toEqual(["case_studies", "case_studies"]);
  });

  it("says when some of the selection is not in this quiz", async () => {
    const { client } = fakeClient((call) => {
      if (call.table === "items" && !isUpdate(call)) return { data: [ROWS[0]] };
      if (call.table === "case_study_items") return { data: [] };
      return { data: [{ id: DRAFT }] };
    });
    expect(
      await archiveSelection(client, BANK, { itemIds: [DRAFT, PUBLISHED], caseStudyIds: [] }),
    ).toEqual({
      archived: { items: 1, caseStudies: 0 },
      refusals: [ARCHIVE_SELECTION_ERRORS.changed],
    });
  });

  it("stops at the save limit and says so, keeping what was archived", async () => {
    const { client } = fakeClient((call) => {
      if (call.table === "items" && !isUpdate(call)) return { data: [ROWS[0]] };
      if (call.table === "case_study_items") return { data: [] };
      if (call.table === "items") return { data: [{ id: DRAFT }] };
      if (!isUpdate(call)) return { data: [{ id: CASE, status: "published" }] };
      return { error: { code: "54000" } };
    });
    expect(
      await archiveSelection(client, BANK, { itemIds: [DRAFT], caseStudyIds: [CASE] }),
    ).toEqual({
      archived: { items: 1, caseStudies: 0 },
      refusals: [RATE_LIMIT_ERRORS.limited],
    });
  });

  it("says it failed when a read fails, archiving nothing", async () => {
    const { client, calls } = fakeClient(() => ({ error: { code: "XX000" } }));
    expect(await archiveSelection(client, BANK, { itemIds: [DRAFT], caseStudyIds: [] })).toEqual({
      archived: { items: 0, caseStudies: 0 },
      refusals: [ARCHIVE_SELECTION_ERRORS.failed],
    });
    expect(calls.some(isUpdate)).toBe(false);
  });

  it("names a step the trigger refused after the check (2BP01), in plain words", async () => {
    const { client } = fakeClient((call) => {
      if (call.table === "items" && !isUpdate(call)) return { data: [ROWS[0]] };
      if (call.table === "case_study_items") return { data: [] };
      return { error: { code: "2BP01" } };
    });
    const result = await archiveSelection(client, BANK, { itemIds: [DRAFT], caseStudyIds: [] });
    expect(result.archived.items).toBe(0);
    expect(result.refusals[0]).toMatch(/became a step in a case study/);
  });
});
