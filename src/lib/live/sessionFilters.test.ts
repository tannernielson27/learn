import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_FILTERS,
  groupSessionsByDate,
  isFiltered,
  parseSessionFilters,
  SESSION_PAGE,
  SESSION_SHOW_MAX,
  sessionsHref,
  titlePattern,
} from "./sessionFilters";

describe("parseSessionFilters (#565)", () => {
  it("reads nothing as the plain list", () => {
    expect(parseSessionFilters({})).toEqual(DEFAULT_SESSION_FILTERS);
  });

  it("reads a search, a status, a host filter and a length", () => {
    expect(
      parseSessionFilters({ q: "  cardiac ", status: "ended", who: "mine", show: "100" }),
    ).toEqual({ q: "cardiac", status: "ended", who: "mine", show: 100 });
  });

  it("falls back to the default for anything it does not know", () => {
    expect(parseSessionFilters({ status: "deleted", who: "them", show: "lots" })).toEqual(
      DEFAULT_SESSION_FILTERS,
    );
  });

  it("takes the first of a repeated parameter", () => {
    expect(parseSessionFilters({ status: ["open", "ended"] }).status).toBe("open");
  });

  it("rounds the length up to whole pages and caps it", () => {
    expect(parseSessionFilters({ show: "51" }).show).toBe(2 * SESSION_PAGE);
    expect(parseSessionFilters({ show: "10" }).show).toBe(SESSION_PAGE);
    expect(parseSessionFilters({ show: "99999" }).show).toBe(SESSION_SHOW_MAX);
  });

  it("keeps a search to 100 characters", () => {
    expect(parseSessionFilters({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
});

describe("isFiltered", () => {
  it("counts a search or a filter, not the length", () => {
    expect(isFiltered(DEFAULT_SESSION_FILTERS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_SESSION_FILTERS, show: 200 })).toBe(false);
    expect(isFiltered({ ...DEFAULT_SESSION_FILTERS, q: "a" })).toBe(true);
    expect(isFiltered({ ...DEFAULT_SESSION_FILTERS, who: "mine" })).toBe(true);
  });
});

describe("sessionsHref", () => {
  it("is the bare path at the defaults", () => {
    expect(sessionsHref()).toBe("/author/sessions");
    expect(sessionsHref(DEFAULT_SESSION_FILTERS)).toBe("/author/sessions");
  });

  it("writes only what differs from the defaults", () => {
    expect(sessionsHref({ q: "pre op", status: "open", show: 100 })).toBe(
      "/author/sessions?q=pre+op&status=open&show=100",
    );
  });

  it("round-trips through parseSessionFilters", () => {
    const filters = { q: "50% & more", status: "ended", who: "mine", show: 150 } as const;
    const query = new URLSearchParams(sessionsHref(filters).split("?")[1]);
    expect(parseSessionFilters(Object.fromEntries(query))).toEqual(filters);
  });
});

describe("titlePattern", () => {
  it("wraps the search in wildcards", () => {
    expect(titlePattern("cardiac")).toBe("%cardiac%");
  });

  it("makes typed wildcards and backslashes match themselves", () => {
    expect(titlePattern("100%_a\\b")).toBe("%100\\%\\_a\\\\b%");
  });
});

describe("groupSessionsByDate", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const at = (openedAt: string) => ({ openedAt });

  it("puts the last week first, then the rest of this month, then each month", () => {
    const groups = groupSessionsByDate(
      [
        at("2026-11-13T09:00:00Z"),
        at("2026-11-08T09:00:00Z"),
        at("2026-11-02T09:00:00Z"),
        at("2026-10-30T09:00:00Z"),
        at("2026-09-01T09:00:00Z"),
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.sessions.length])).toEqual([
      ["This week", 2],
      ["Earlier this month", 1],
      ["October 2026", 1],
      ["September 2026", 1],
    ]);
  });

  it("calls a past year by its year", () => {
    expect(groupSessionsByDate([at("2025-11-20T09:00:00Z")], now)[0]?.label).toBe("November 2025");
  });

  it("has no groups for no sessions", () => {
    expect(groupSessionsByDate([], now)).toEqual([]);
  });
});
