import { describe, expect, it } from "vitest";
import {
  CLASS_TAB_LABELS,
  CLASS_HEADER_READS,
  CLASS_TAB_READS,
  CLASS_TABS,
  DEFAULT_CLASS_TAB,
  classTabPath,
  classTabReads,
  parseClassTab,
} from "./classTabs";

const CLASS = "00000000-0000-4000-8000-00000000c1a5";

describe("class page tabs", () => {
  it("are Overview, Students, Progress, Live sessions, Assignments and Settings, in that order", () => {
    expect(CLASS_TABS.map((tab) => CLASS_TAB_LABELS[tab])).toEqual([
      "Overview",
      "Students",
      "Progress",
      "Live sessions",
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
    expect(classTabPath(CLASS, "progress")).toBe(`/author/classes/${CLASS}?tab=progress`);
    expect(classTabPath(CLASS, "sessions")).toBe(`/author/classes/${CLASS}?tab=sessions`);
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
    "Progress",
    "__proto__",
    "toString",
    ["students", "settings"],
    42,
  ])("falls back to the overview for %j", (value) => {
    expect(parseClassTab(value)).toBe("overview");
  });
});

describe("classTabReads", () => {
  it("reads the roster on every tab, for the header's student count", () => {
    expect(CLASS_HEADER_READS).toEqual(["roster"]);
    for (const tab of CLASS_TABS) expect(classTabReads(tab).has("roster")).toBe(true);
  });

  it("reads only what each tab shows", () => {
    const reads = (tab: (typeof CLASS_TABS)[number]) => [...classTabReads(tab)].sort();
    expect(reads("overview")).toEqual(["assignments", "roster", "shares"]);
    expect(reads("students")).toEqual(["roster"]);
    expect(reads("assignments")).toEqual(["assignments", "banks", "roster", "shares"]);
    expect(reads("settings")).toEqual(["roster"]);
    expect(reads("progress")).toEqual(["progress", "roster"]);
    expect(reads("sessions")).toEqual(["roster", "sessions"]);
  });

  it("reads the class's progress, the heaviest read, on Progress only", () => {
    expect(CLASS_TABS.filter((tab) => classTabReads(tab).has("progress"))).toEqual(["progress"]);
  });

  it("reads the banks, the share form's choices, on Assignments only", () => {
    expect(CLASS_TABS.filter((tab) => classTabReads(tab).has("banks"))).toEqual(["assignments"]);
  });

  it("names every tab, so a new tab says what it reads", () => {
    expect(Object.keys(CLASS_TAB_READS).sort()).toEqual([...CLASS_TABS].sort());
  });
});
