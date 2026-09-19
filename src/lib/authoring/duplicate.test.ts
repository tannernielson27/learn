import { describe, expect, it, vi } from "vitest";
import { DUPLICATE_ERRORS, duplicateCaseStudy, duplicateItem } from "./duplicate";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

function fakeClient(result: Result) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as never, rpc };
}

const ITEM_ID = "00000000-0000-4000-8000-000000000010";
const CASE_ID = "00000000-0000-4000-8000-000000000020";
const COPY_ID = "00000000-0000-4000-8000-000000000030";

describe("duplicateItem", () => {
  it("copies the item in one database call and returns the copy's id", async () => {
    const fake = fakeClient({ data: COPY_ID, error: null });
    expect(await duplicateItem(fake.client, ITEM_ID)).toEqual({ ok: true, value: { id: COPY_ID } });
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("duplicate_item", { source_item: ITEM_ID });
  });

  it("says the item is gone when the caller cannot see it", async () => {
    const fake = fakeClient({ data: null, error: { code: "22023" } });
    expect(await duplicateItem(fake.client, ITEM_ID)).toEqual({
      ok: false,
      error: DUPLICATE_ERRORS.itemGone,
    });
  });

  it("says the copy was not made on any other failure", async () => {
    const fake = fakeClient({ data: null, error: { code: "42501" } });
    expect(await duplicateItem(fake.client, ITEM_ID)).toEqual({
      ok: false,
      error: DUPLICATE_ERRORS.itemFailed,
    });
  });

  it("does not trust a reply that is not an id", async () => {
    const fake = fakeClient({ data: { id: COPY_ID }, error: null });
    expect(await duplicateItem(fake.client, ITEM_ID)).toEqual({
      ok: false,
      error: DUPLICATE_ERRORS.itemFailed,
    });
  });

  it("refuses an id that is not a UUID before calling the database", async () => {
    const fake = fakeClient({ data: COPY_ID, error: null });
    expect(await duplicateItem(fake.client, "not-an-id")).toEqual({
      ok: false,
      error: DUPLICATE_ERRORS.itemGone,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe("duplicateCaseStudy", () => {
  it("copies the case study and its steps in one database call", async () => {
    const fake = fakeClient({ data: COPY_ID, error: null });
    expect(await duplicateCaseStudy(fake.client, CASE_ID)).toEqual({
      ok: true,
      value: { id: COPY_ID },
    });
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("duplicate_case_study", { source_case_study: CASE_ID });
  });

  it("says the case study is gone when the caller cannot see it", async () => {
    const fake = fakeClient({ data: null, error: { code: "22023" } });
    expect(await duplicateCaseStudy(fake.client, CASE_ID)).toEqual({
      ok: false,
      error: DUPLICATE_ERRORS.caseStudyGone,
    });
  });

  it("says the copy was not made on any other failure", async () => {
    const fake = fakeClient({ data: null, error: { code: "23514" } });
    expect(await duplicateCaseStudy(fake.client, CASE_ID)).toEqual({
      ok: false,
      error: DUPLICATE_ERRORS.caseStudyFailed,
    });
  });

  it("refuses an id that is not a UUID before calling the database", async () => {
    const fake = fakeClient({ data: COPY_ID, error: null });
    expect(await duplicateCaseStudy(fake.client, "")).toEqual({
      ok: false,
      error: DUPLICATE_ERRORS.caseStudyGone,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});
