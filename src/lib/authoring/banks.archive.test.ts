import { describe, expect, it, vi } from "vitest";
import { listCaseStudies, listItems, listTaggedRows } from "./banks";
import { ITEM_PAGE_SIZE, NO_SEARCH } from "./bankSearch";

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

/** A query builder that records each filter call and resolves to no rows. */
function fakeClient() {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "is", "contains", "textSearch", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
  const rpc = vi.fn(async () => ({ data: [], error: null }));
  const client = { from: () => builder, rpc } as never;
  const statusCalls = () => calls.filter(([, column]) => column === "status");
  return { client, rpc, statusCalls };
}

describe("bank lists and the Archived view", () => {
  it("leaves the item status to the list function by default, so it lists current items", async () => {
    const fake = fakeClient();
    await listItems(fake.client, BANK);
    // No item_status: the database function itself leaves archived items out (archive migration).
    expect(fake.rpc).toHaveBeenCalledWith("list_bank_items", {
      target_bank: BANK,
      unfiled_only: false,
      with_tags: [],
      page_size: ITEM_PAGE_SIZE,
      page_offset: 0,
    });
  });

  it("asks the list function for archived items in the Archived view", async () => {
    const fake = fakeClient();
    await listItems(
      fake.client,
      BANK,
      { kind: "all" },
      { tags: [], step: null, ...NO_SEARCH, status: "archived" },
    );
    expect(fake.rpc).toHaveBeenCalledWith(
      "list_bank_items",
      expect.objectContaining({ item_status: "archived" }),
    );
  });

  it("counts tags among the same items the list shows", async () => {
    const current = fakeClient();
    await listTaggedRows(current.client, BANK);
    expect(current.statusCalls()).toEqual([["neq", "status", "archived"]]);

    const archived = fakeClient();
    await listTaggedRows(
      archived.client,
      BANK,
      { kind: "unfiled" },
      {
        ...NO_SEARCH,
        status: "archived",
      },
    );
    expect(archived.statusCalls()).toEqual([["eq", "status", "archived"]]);
  });

  it("lists case studies the same way", async () => {
    const current = fakeClient();
    await listCaseStudies(current.client, BANK);
    expect(current.statusCalls()).toEqual([["neq", "status", "archived"]]);

    const archived = fakeClient();
    await listCaseStudies(
      archived.client,
      BANK,
      { kind: "all" },
      {
        ...NO_SEARCH,
        status: "archived",
      },
    );
    expect(archived.statusCalls()).toEqual([["eq", "status", "archived"]]);
  });

  it("keeps a draft or published filter, which never shows archived content", async () => {
    const fake = fakeClient();
    await listCaseStudies(fake.client, BANK, { kind: "all" }, { ...NO_SEARCH, status: "draft" });
    expect(fake.statusCalls()).toEqual([["eq", "status", "draft"]]);
  });
});
