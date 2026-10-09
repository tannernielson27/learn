import { describe, expect, it } from "vitest";
import { classLabel, spansWorkspaces, studentClassInfo } from "./studentClasses";

function entry(id: string, name: string, workspaceName: string | null, timeZone = "UTC") {
  return { id, name, timeZone, workspaceName };
}

describe("spansWorkspaces", () => {
  it("is false for no classes, one class, and several classes of one workspace", () => {
    expect(spansWorkspaces([])).toBe(false);
    expect(spansWorkspaces(null)).toBe(false);
    expect(spansWorkspaces([entry("c1", "NUR 301", "Ada's workspace")])).toBe(false);
    expect(
      spansWorkspaces([
        entry("c1", "NUR 301", "Ada's workspace"),
        entry("c2", "NUR 302", "Ada's workspace"),
      ]),
    ).toBe(false);
  });

  it("is true once two classes name different workspaces", () => {
    expect(
      spansWorkspaces([
        entry("c1", "NUR 301", "Ada's workspace"),
        entry("c2", "NUR 301", "Grace's workspace"),
      ]),
    ).toBe(true);
  });

  it("does not count a class whose workspace is not known", () => {
    expect(
      spansWorkspaces([entry("c1", "NUR 301", "Ada's workspace"), entry("c2", "NUR 302", null)]),
    ).toBe(false);
    expect(
      spansWorkspaces([entry("c1", "NUR 301", "Ada's workspace"), entry("c2", "NUR 302", "  ")]),
    ).toBe(false);
  });
});

describe("studentClassInfo", () => {
  it("keeps the name and zone, and leaves the workspace off within one workspace", () => {
    const info = studentClassInfo([
      entry("c1", "NUR 301", "Ada's workspace", "America/Denver"),
      entry("c2", "NUR 302", "Ada's workspace", "America/Chicago"),
    ]);
    expect(info.get("c1")).toEqual({
      name: "NUR 301",
      timeZone: "America/Denver",
      workspaceName: null,
    });
    expect(info.get("c2")?.workspaceName).toBeNull();
  });

  it("carries each class's workspace when the classes span more than one", () => {
    const info = studentClassInfo([
      entry("c1", "NUR 301", "Ada's workspace"),
      entry("c2", "NUR 301", "Grace's workspace"),
      entry("c3", "NUR 303", null),
    ]);
    expect(info.get("c1")?.workspaceName).toBe("Ada's workspace");
    expect(info.get("c2")?.workspaceName).toBe("Grace's workspace");
    expect(info.get("c3")?.workspaceName).toBeNull();
  });

  it("is empty when the classes could not be read", () => {
    expect(studentClassInfo(null).size).toBe(0);
  });
});

describe("classLabel", () => {
  it("is the class name alone when no workspace is carried", () => {
    expect(classLabel({ name: "NUR 301", workspaceName: null })).toBe("NUR 301");
    expect(classLabel({ name: "NUR 301" })).toBe("NUR 301");
  });

  it("puts the workspace beside the class name", () => {
    expect(classLabel({ name: "NUR 301", workspaceName: "Ada's workspace" })).toBe(
      "NUR 301, Ada's workspace",
    );
  });

  it("falls back for a class the student is no longer in", () => {
    expect(classLabel(undefined)).toBe("Your class");
  });
});
