import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { toItemRow } from "@/lib/supabase/itemRows";
import { listItems, listTaggedRows, WARNING_SCAN_LIMIT } from "./banks";
import { NO_BANK_FILTER } from "./bankSearch";

// React's `cache` memoizes only inside a server render; outside one it calls through. This stands in
// for one request's scope: a memo per argument, which is what the bank page's render gets.
vi.mock("react", async (actual) => ({
  ...(await actual<typeof import("react")>()),
  cache: <A extends object, R>(fn: (arg: A) => R) => {
    const memo = new WeakMap<A, R>();
    return (arg: A) => {
      if (!memo.has(arg)) memo.set(arg, fn(arg));
      return memo.get(arg)!;
    };
  },
}));

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const warned = itemSchema.parse({ ...FIXTURES.multiple_choice.canonical, rationale: {} });
const clean = itemSchema.parse(FIXTURES.multiple_choice.canonical);

const listed = (id: string) => ({
  id,
  type: "multiple_choice",
  status: "published",
  updated_at: "2026-09-19T12:00:00Z",
  cjmm_step: 1,
  tags: [],
  stem: { kind: "markdown", value: "Stem" },
  max_points: 1,
  stem_match: null,
  text_match: null,
  rationale_match: false,
  total_count: 300,
});

/**
 * A client whose list function answers the page (50) and the scan (200) with their own ids, and
 * whose whole-row read returns a row for each id asked, `w…` ids warning. Records each row read.
 */
function fakeClient(pageIds: string[], scanIds: string[]) {
  const rowReads: string[][] = [];
  const rpc = vi.fn(async (_name: string, args: { page_size: number }) => ({
    data: (args.page_size === WARNING_SCAN_LIMIT ? scanIds : pageIds).map(listed),
    error: null,
  }));
  const from = vi.fn(() => {
    let whole = false;
    let ids: string[] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ["eq", "neq", "is", "textSearch", "limit"]) chain[method] = () => chain;
    chain.select = (columns: string) => {
      whole = columns.includes("answer_key");
      return chain;
    };
    chain.in = (_column: string, values: string[]) => {
      ids = values;
      return chain;
    };
    chain.then = (resolve: (value: unknown) => unknown) => {
      if (!whole) return resolve({ data: scanIds.map((id) => ({ id, cjmm_step: 1, tags: [] })) });
      rowReads.push(ids);
      const rows = ids.map((id) => ({ ...toItemRow(id.startsWith("w") ? warned : clean), id }));
      return resolve({ data: rows, error: null });
    };
    return chain;
  });
  return { client: { from, rpc } as never, rowReads };
}

const ids = (prefix: string, count: number, start = 0) =>
  Array.from({ length: count }, (_, index) => `${prefix}${start + index}`);

describe("the bank page's item list and tag counts in one request", () => {
  it("reads each item's whole row once when the page is inside the scan", async () => {
    const scan = [...ids("w", 100), ...ids("c", 100)];
    const page = scan.slice(0, 50);
    const fake = fakeClient(page, scan);
    const [itemPage, tagged] = await Promise.all([
      listItems(fake.client, BANK, { kind: "all" }, NO_BANK_FILTER, 1),
      listTaggedRows(fake.client, BANK),
    ]);
    expect(fake.rowReads.flat().sort()).toEqual([...scan].sort());
    expect(itemPage.items.map((item) => [item.id, item.warningCount])).toEqual(
      page.map((id) => [id, 1]),
    );
    expect(tagged.filter((row) => row.hasWarnings)).toHaveLength(100);
  });

  it("still reads a page's rows that the scan does not hold, and only those", async () => {
    const scan = [...ids("w", 100), ...ids("c", 100)];
    const page = [...ids("w", 25, 200), ...ids("c", 25, 200)];
    const fake = fakeClient(page, scan);
    const [itemPage] = await Promise.all([
      listItems(fake.client, BANK, { kind: "all" }, NO_BANK_FILTER, 5),
      listTaggedRows(fake.client, BANK),
    ]);
    expect(fake.rowReads.flat().sort()).toEqual([...scan, ...page].sort());
    expect(itemPage.items.map((item) => [item.id, item.warningCount])).toEqual(
      page.map((id) => [id, id.startsWith("w") ? 1 : 0]),
    );
  });
});
