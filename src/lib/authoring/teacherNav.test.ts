import { describe, expect, it } from "vitest";
import { TEACHER_NAV, teacherNavCurrent, teacherNavSection } from "./teacherNav";

const ID = "00000000-0000-4000-8000-0000000000b1";

describe("TEACHER_NAV", () => {
  it("lists the library, classes, live sessions and the workspace, in that order", () => {
    expect(TEACHER_NAV.map((item) => [item.label, item.href])).toEqual([
      ["Library", "/author"],
      ["Classes", "/author/classes"],
      ["Live sessions", "/author/sessions"],
      ["Workspace", "/author/workspace"],
    ]);
  });
});

describe("teacherNavSection", () => {
  it.each([
    ["/author", "library"],
    ["/author/", "library"],
    [`/author/banks/${ID}`, "library"],
    [`/author/banks/${ID}/new`, "library"],
    [`/author/banks/${ID}/assign`, "library"],
    [`/author/items/${ID}`, "library"],
    [`/author/items/${ID}/play`, "library"],
    [`/author/case-studies/${ID}`, "library"],
    [`/author/case-studies/${ID}/assign`, "library"],
    ["/author/classes", "classes"],
    [`/author/classes/${ID}`, "classes"],
    [`/author/assignments/${ID}/report`, "classes"],
    ["/author/sessions", "sessions"],
    ["/author/workspace", "workspace"],
  ])("puts %s in %s", (pathname, section) => {
    expect(teacherNavSection(pathname)).toBe(section);
  });

  it.each(["/author/no-access", "/author/classesx", "/account", "/help", "/"])(
    "puts %s nowhere",
    (pathname) => {
      expect(teacherNavSection(pathname)).toBeNull();
    },
  );
});

describe("teacherNavCurrent", () => {
  const [library, classes] = TEACHER_NAV;

  it("marks the destination itself as the current page", () => {
    expect(teacherNavCurrent(library!, "/author")).toBe("page");
    expect(teacherNavCurrent(classes!, "/author/classes/")).toBe("page");
  });

  it("marks the destination a deeper page belongs to as current, and not as the page", () => {
    expect(teacherNavCurrent(library!, `/author/banks/${ID}`)).toBe("true");
    expect(teacherNavCurrent(classes!, `/author/classes/${ID}`)).toBe("true");
  });

  it("marks nothing else", () => {
    expect(teacherNavCurrent(library!, "/author/classes")).toBeUndefined();
    expect(teacherNavCurrent(classes!, "/author")).toBeUndefined();
    expect(teacherNavCurrent(library!, "/author/no-access")).toBeUndefined();
  });
});
