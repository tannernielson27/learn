import { describe, expect, it } from "vitest";
import {
  CLASS_TAB_LABELS,
  CLASS_TABS,
  DEFAULT_CLASS_TAB,
  classTabPath,
  parseClassTab,
} from "./classTabs";

const CLASS = "00000000-0000-4000-8000-00000000c1a5";

describe("class page tabs", () => {
  it("are Overview, Students, Assignments and Settings, in that order", () => {
    expect(CLASS_TABS.map((tab) => CLASS_TAB_LABELS[tab])).toEqual([
      "Overview",
      "Students",
      "Assignments",
      "Settings",
    ]);
  });

  it("open on the overview", () => {
    expect(DEFAULT_CLASS_TAB).toBe("overview");
  });
});

describe("classTabPath", () => {
  it("keeps the overview at the class's own address, so every old link still lands there", () => {
    expect(classTabPath(CLASS)).toBe(`/author/classes/${CLASS}`);
    expect(classTabPath(CLASS, "overview")).toBe(`/author/classes/${CLASS}`);
  });

  it("puts any other tab in the address", () => {
    expect(classTabPath(CLASS, "students")).toBe(`/author/classes/${CLASS}?tab=students`);
    expect(classTabPath(CLASS, "assignments")).toBe(`/author/classes/${CLASS}?tab=assignments`);
    expect(classTabPath(CLASS, "settings")).toBe(`/author/classes/${CLASS}?tab=settings`);
  });
});

describe("parseClassTab", () => {
  it.each(CLASS_TABS)("accepts %s", (tab) => {
    expect(parseClassTab(tab)).toBe(tab);
  });

  it.each([
    undefined,
    null,
    "",
    "Students",
    "roster",
    "live-sessions",
    "progress",
    "__proto__",
    "toString",
    ["students", "settings"],
    42,
  ])("falls back to the overview for %j", (value) => {
    expect(parseClassTab(value)).toBe("overview");
  });
});
