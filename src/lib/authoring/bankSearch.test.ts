import { describe, expect, it } from "vitest";
import {
  isSearching,
  NO_SEARCH,
  pageCount,
  pageOffset,
  parseItemSearch,
  parsePage,
  SEARCH_MAX_LENGTH,
  searchSummary,
} from "./bankSearch";

describe("searchSummary", () => {
  it("says how many items match, and what they match", () => {
    expect(searchSummary(6, { query: "lactate", type: null, status: null })).toBe(
      "6 items match: “lactate”.",
    );
    expect(
      searchSummary(1, { query: "lactate", type: "matrix_multiple_choice", status: "published" }),
    ).toBe("1 item matches: “lactate”, Matrix Multiple Choice, Published.");
    expect(searchSummary(0, { query: "", type: null, status: "draft" })).toBe(
      "0 items match: Draft.",
    );
  });
});

describe("parseItemSearch", () => {
  it("reads no search from nothing", () => {
    expect(parseItemSearch({})).toEqual(NO_SEARCH);
    expect(isSearching(NO_SEARCH)).toBe(false);
  });

  it("reads the words, trimmed and with whitespace closed up", () => {
    expect(parseItemSearch({ q: "  serum \n lactate " }).query).toBe("serum lactate");
    expect(parseItemSearch({ q: ["lactate", "other"] }).query).toBe("lactate");
  });

  it("cuts a long search at the limit", () => {
    const query = parseItemSearch({ q: "a".repeat(SEARCH_MAX_LENGTH + 50) }).query;
    expect(query).toHaveLength(SEARCH_MAX_LENGTH);
  });

  it("reads a known item type and status, and ignores anything else", () => {
    expect(parseItemSearch({ type: "matrix_multiple_choice", status: "published" })).toEqual({
      query: "",
      type: "matrix_multiple_choice",
      status: "published",
    });
    expect(parseItemSearch({ type: "essay", status: "deleted" })).toEqual(NO_SEARCH);
    expect(parseItemSearch({ type: "", status: "" })).toEqual(NO_SEARCH);
  });

  it("counts a type or status alone as a search", () => {
    expect(isSearching(parseItemSearch({ status: "draft" }))).toBe(true);
    expect(isSearching(parseItemSearch({ type: "bowtie" }))).toBe(true);
    expect(isSearching(parseItemSearch({ q: "lactate" }))).toBe(true);
  });
});

describe("parsePage", () => {
  it("reads a whole page number of at least one", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["2", "5"])).toBe(2);
  });

  it.each([[undefined], ["0"], ["-1"], ["2.5"], ["x"], ["1e3"], ["99999999"]])(
    "reads %j as the first page",
    (value) => {
      expect(parsePage(value)).toBe(1);
    },
  );
});

describe("pageCount and pageOffset", () => {
  it("count at least one page and skip whole pages", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(pageOffset(1, 50)).toBe(0);
    expect(pageOffset(3, 50)).toBe(100);
  });
});
