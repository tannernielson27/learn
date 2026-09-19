import { describe, expect, it, vi } from "vitest";
import {
  AuthoringDataError,
  listCaseStudies,
  listItems,
  listTaggedRows,
  stemExcerpt,
  storedMaxPoints,
  storedTags,
} from "./banks";
import { ITEM_PAGE_SIZE, NO_BANK_FILTER } from "./bankSearch";

describe("storedTags", () => {
  it("keeps the strings of a stored tag list", () => {
    expect(storedTags(["sepsis", 3, "Physiological Adaptation"])).toEqual([
      "sepsis",
      "Physiological Adaptation",
    ]);
  });

  it.each([[null], [undefined], ["sepsis"], [{}]])("reads %j as no tags", (value) => {
    expect(storedTags(value)).toEqual([]);
  });
});

describe("storedMaxPoints", () => {
  it("reads a whole number of points of at least one", () => {
    expect(storedMaxPoints(4)).toBe(4);
    expect(storedMaxPoints(1)).toBe(1);
  });

  it.each([[0], [-1], [2.5], ["3"], [null], [undefined], [{}]])(
    "shows no points for unset or malformed scoring %j",
    (value) => {
      expect(storedMaxPoints(value)).toBeNull();
    },
  );
});

describe("stemExcerpt", () => {
  it("reads the markdown stem as plain text", () => {
    expect(
      stemExcerpt({ kind: "markdown", value: "**Which** findings\n\nneed _follow-up_?" }),
    ).toBe("Which findings need follow-up?");
  });

  it("keeps parentheses in text, so a copy's (copy) marker shows in the list", () => {
    expect(stemExcerpt({ kind: "markdown", value: "(copy) Gained 2.3 kg (5 lb)?" })).toBe(
      "(copy) Gained 2.3 kg (5 lb)?",
    );
  });

  it("shows a link's text without its address", () => {
    expect(
      stemExcerpt({ kind: "markdown", value: "See [the chart](https://x.test/a) first" }),
    ).toBe("See the chart first");
    expect(
      stemExcerpt({ kind: "markdown", value: "See [the chart](https://x.test/a(b)) first" }),
    ).toBe("See the chart first");
  });

  it("shortens a long stem on a word boundary with an ellipsis", () => {
    const excerpt = stemExcerpt({ kind: "markdown", value: "word ".repeat(60) }, 20);
    expect(excerpt.length).toBeLessThanOrEqual(20);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it.each([[null], [undefined], ["plain string"], [{ kind: "markdown" }], [{ value: 3 }]])(
    "returns an empty excerpt for a malformed stem %j",
    (stem) => {
      expect(stemExcerpt(stem)).toBe("");
    },
  );
});

type Result = { data?: unknown; error?: { message?: string } | null };

/** A chainable stand-in for the Supabase client that records every call and returns one result. */
function fakeClient(result: Result = { data: [], error: null }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "contains", "textSearch", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.then = (resolve: (value: Result) => unknown) => resolve(result);
  const from = vi.fn(() => chain);
  const rpc = vi.fn(async () => result);
  return { client: { from, rpc } as never, from, rpc, calls };
}

const BANK = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const FOLDER = "0b7a2c1d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const mark = (word: string) => `\u0002${word}\u0003`;

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "i1",
  type: "matrix_multiple_choice",
  status: "published",
  updated_at: "2026-09-19T12:00:00Z",
  cjmm_step: 1,
  tags: ["sepsis"],
  stem: { kind: "markdown", value: "Which findings suggest a rising lactate?" },
  max_points: 4,
  stem_match: null,
  text_match: null,
  rationale_match: false,
  total_count: 120,
  ...overrides,
});

describe("listItems", () => {
  it("asks the list function for one page of the view, filter and search", async () => {
    const fake = fakeClient({ data: [row()], error: null });
    await listItems(
      fake.client,
      BANK,
      { kind: "folder", id: FOLDER },
      {
        tags: ["sepsis"],
        step: 1,
        query: "lactate",
        type: "matrix_multiple_choice",
        status: "published",
      },
      3,
    );
    expect(fake.rpc).toHaveBeenCalledWith("list_bank_items", {
      target_bank: BANK,
      search: "lactate",
      item_type: "matrix_multiple_choice",
      item_status: "published",
      in_folder: FOLDER,
      unfiled_only: false,
      with_tags: ["sepsis"],
      with_step: 1,
      page_size: ITEM_PAGE_SIZE,
      page_offset: 2 * ITEM_PAGE_SIZE,
    });
  });

  it("leaves out what is not set, and asks for Unfiled", async () => {
    const fake = fakeClient({ data: [], error: null });
    await listItems(fake.client, BANK, { kind: "unfiled" });
    expect(fake.rpc).toHaveBeenCalledWith("list_bank_items", {
      target_bank: BANK,
      unfiled_only: true,
      with_tags: [],
      page_size: ITEM_PAGE_SIZE,
      page_offset: 0,
    });
  });

  it("reads rows as summaries, with the total for paging", async () => {
    const fake = fakeClient({ data: [row()], error: null });
    const page = await listItems(fake.client, BANK, { kind: "all" }, NO_BANK_FILTER, 2);
    expect(page).toEqual({
      items: [
        {
          id: "i1",
          type: "matrix_multiple_choice",
          status: "published",
          updatedAt: "2026-09-19T12:00:00Z",
          stemExcerpt: "Which findings suggest a rising lactate?",
          maxPoints: 4,
          cjmmStep: 1,
          tags: ["sepsis"],
          match: null,
        },
      ],
      total: 120,
      page: 2,
      pageCount: 3,
    });
  });

  it("reads matched words into segments, and a rationale match as a flag alone", async () => {
    const fake = fakeClient({
      data: [
        row({ id: "a", stem_match: `A rising ${mark("lactate")}?` }),
        row({ id: "b", text_match: `Recheck the serum ${mark("lactate")}` }),
        row({ id: "c", rationale_match: true }),
      ],
      error: null,
    });
    const { items } = await listItems(
      fake.client,
      BANK,
      { kind: "all" },
      {
        ...NO_BANK_FILTER,
        query: "lactate",
      },
    );
    expect(items.map((item) => item.match)).toEqual([
      {
        stem: [
          { text: "A rising ", match: false },
          { text: "lactate", match: true },
          { text: "?", match: false },
        ],
        text: null,
        rationale: false,
      },
      {
        stem: null,
        text: [
          { text: "Recheck the serum ", match: false },
          { text: "lactate", match: true },
        ],
        rationale: false,
      },
      { stem: null, text: null, rationale: true },
    ]);
  });

  it("reads an empty page as no items and no total", async () => {
    const fake = fakeClient({ data: [], error: null });
    const page = await listItems(fake.client, BANK, { kind: "all" }, NO_BANK_FILTER, 4);
    expect(page).toEqual({ items: [], total: 0, page: 4, pageCount: 1 });
  });

  it("throws a plain error when the list cannot be read", async () => {
    const fake = fakeClient({ data: null, error: { message: "permission denied" } });
    await expect(listItems(fake.client, BANK)).rejects.toThrow(
      new AuthoringDataError("Items could not be loaded."),
    );
  });
});

describe("listTaggedRows", () => {
  it("counts tags within the search, type and status", async () => {
    const fake = fakeClient({ data: [{ cjmm_step: 2, tags: ["renal"] }], error: null });
    const rows = await listTaggedRows(
      fake.client,
      BANK,
      { kind: "all" },
      {
        query: "lactate",
        type: "bowtie",
        status: "draft",
      },
    );
    expect(rows).toEqual([{ cjmmStep: 2, tags: ["renal"] }]);
    expect(fake.calls).toContainEqual({
      method: "textSearch",
      args: ["search_vector", "lactate", { config: "english", type: "websearch" }],
    });
    expect(fake.calls).toContainEqual({ method: "eq", args: ["type", "bowtie"] });
    expect(fake.calls).toContainEqual({ method: "eq", args: ["status", "draft"] });
  });

  it("adds nothing without a search", async () => {
    const fake = fakeClient({ data: [], error: null });
    await listTaggedRows(fake.client, BANK);
    expect(fake.calls.map((call) => call.method)).toEqual(["select", "eq", "limit"]);
  });
});

describe("listCaseStudies", () => {
  it("searches titles only, and narrows by status", async () => {
    const fake = fakeClient({ data: [], error: null });
    await listCaseStudies(
      fake.client,
      BANK,
      { kind: "all" },
      {
        query: "sepsis",
        type: null,
        status: "published",
      },
    );
    expect(fake.calls).toContainEqual({
      method: "textSearch",
      args: ["title", "sepsis", { config: "english", type: "websearch" }],
    });
    expect(fake.calls).toContainEqual({ method: "eq", args: ["status", "published"] });
  });
});
