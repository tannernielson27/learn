import { describe, expect, it, vi } from "vitest";
import {
  ARCHIVE_ERRORS,
  archiveCaseStudy,
  archiveItem,
  isArchivedError,
  restoreCaseStudy,
  restoreItem,
  stepArchiveRefusal,
} from "./archive";

type Result = {
  data?: unknown;
  error?: { code?: string; message?: string; details?: string; hint?: string } | null;
};

function fakeClient(result: Result) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as never, rpc };
}

const ITEM_ID = "00000000-0000-4000-8000-000000000010";
const CASE_ID = "00000000-0000-4000-8000-000000000020";

describe("archiveItem", () => {
  it("archives the item in one database call", async () => {
    const fake = fakeClient({ data: null, error: null });
    expect(await archiveItem(fake.client, ITEM_ID)).toEqual({ ok: true });
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("archive_item", { target: ITEM_ID });
  });

  it("says the item is gone when the caller cannot see it", async () => {
    const fake = fakeClient({ error: { code: "22023" } });
    expect(await archiveItem(fake.client, ITEM_ID)).toEqual({
      ok: false,
      error: ARCHIVE_ERRORS.itemGone,
    });
  });

  it("refuses a case study step with a reason naming the case study and the step", async () => {
    const fake = fakeClient({
      error: {
        code: "2BP01",
        message: 'this item is step 3 of the case study "Heart failure"',
        details: "Heart failure",
        hint: "3",
      },
    });
    expect(await archiveItem(fake.client, ITEM_ID)).toEqual({
      ok: false,
      error: stepArchiveRefusal("Heart failure", "3"),
    });
    expect(stepArchiveRefusal("Heart failure", "3")).toBe(
      'This item is step 3 of the case study "Heart failure". Archive the case study instead, or give that step another item first.',
    );
  });

  it("still refuses a step plainly when the reply names no case study", async () => {
    const fake = fakeClient({ error: { code: "2BP01" } });
    expect(await archiveItem(fake.client, ITEM_ID)).toEqual({
      ok: false,
      error: stepArchiveRefusal(undefined, undefined),
    });
    expect(stepArchiveRefusal(undefined, undefined)).toBe(
      "This item is a step in a case study. Archive the case study instead, or give that step another item first.",
    );
  });

  it("says it failed on any other error", async () => {
    const fake = fakeClient({ error: { code: "42501" } });
    expect(await archiveItem(fake.client, ITEM_ID)).toEqual({
      ok: false,
      error: ARCHIVE_ERRORS.failed,
    });
  });

  it("refuses a malformed id before any call", async () => {
    const fake = fakeClient({ error: null });
    expect(await archiveItem(fake.client, "not-an-id")).toEqual({
      ok: false,
      error: ARCHIVE_ERRORS.itemGone,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe("restoreItem", () => {
  it("restores the item in one database call", async () => {
    const fake = fakeClient({ error: null });
    expect(await restoreItem(fake.client, ITEM_ID)).toEqual({ ok: true });
    expect(fake.rpc).toHaveBeenCalledWith("restore_item", { target: ITEM_ID });
  });

  it("says the item is gone when the caller cannot see it", async () => {
    const fake = fakeClient({ error: { code: "22023" } });
    expect(await restoreItem(fake.client, ITEM_ID)).toEqual({
      ok: false,
      error: ARCHIVE_ERRORS.itemGone,
    });
  });
});

describe("archiveCaseStudy and restoreCaseStudy", () => {
  it("archive the case study in one database call", async () => {
    const fake = fakeClient({ error: null });
    expect(await archiveCaseStudy(fake.client, CASE_ID)).toEqual({ ok: true });
    expect(fake.rpc).toHaveBeenCalledWith("archive_case_study", { target: CASE_ID });
  });

  it("restore the case study in one database call", async () => {
    const fake = fakeClient({ error: null });
    expect(await restoreCaseStudy(fake.client, CASE_ID)).toEqual({ ok: true });
    expect(fake.rpc).toHaveBeenCalledWith("restore_case_study", { target: CASE_ID });
  });

  it("say the case study is gone when the caller cannot see it", async () => {
    const fake = fakeClient({ error: { code: "22023" } });
    expect(await archiveCaseStudy(fake.client, CASE_ID)).toEqual({
      ok: false,
      error: ARCHIVE_ERRORS.caseStudyGone,
    });
    expect(await restoreCaseStudy(fake.client, CASE_ID)).toEqual({
      ok: false,
      error: ARCHIVE_ERRORS.caseStudyGone,
    });
  });

  it("refuse a malformed id before any call", async () => {
    const fake = fakeClient({ error: null });
    expect(await restoreCaseStudy(fake.client, "x")).toEqual({
      ok: false,
      error: ARCHIVE_ERRORS.caseStudyGone,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe("isArchivedError", () => {
  it("recognizes the database's refusal to change archived content", () => {
    expect(isArchivedError({ code: "55000" })).toBe(true);
    expect(isArchivedError({ code: "23514" })).toBe(false);
    expect(isArchivedError(null)).toBe(false);
  });
});
