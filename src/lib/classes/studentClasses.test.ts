import { describe, expect, it } from "vitest";
import { classLabel, spansWorkspaces, studentClassInfo } from "./studentClasses";

function entry(id: string, name: string, workspaceName: string | null, timeZone = "UTC") {
  return { id, name, timeZone, workspaceName };
}

/** A class as `my_classes()` sends it since 20261011010000: with its workspace's number. */
function numbered(id: string, name: string, workspaceName: string | null, workspaceNumber: number) {
  return { ...entry(id, name, workspaceName), workspaceNumber };
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

describe("spansWorkspaces, by the workspace's number", () => {
  it("is true for two workspaces that share a name", () => {
    expect(
      spansWorkspaces([
        numbered("c1", "NUR 301", "Nursing", 1),
        numbered("c2", "NUR 301", "Nursing", 2),
      ]),
    ).toBe(true);
  });

  it("is false for several classes of one workspace", () => {
    expect(
      spansWorkspaces([
        numbered("c1", "NUR 301", "Nursing", 1),
        numbered("c2", "NUR 302", "Nursing", 1),
      ]),
    ).toBe(false);
  });

  it("counts a numbered workspace whose name did not arrive", () => {
    expect(
      spansWorkspaces([
        numbered("c1", "NUR 301", "Nursing", 1),
        numbered("c2", "NUR 302", null, 2),
      ]),
    ).toBe(true);
  });

  it("goes by name, as before, while the database sends no number", () => {
    // Deployed ahead of 20261011010000: same-named workspaces still count as one.
    const before = [
      { ...entry("c1", "NUR 301", "Nursing"), workspaceNumber: null },
      { ...entry("c2", "NUR 301", "Nursing"), workspaceNumber: null },
    ];
    expect(spansWorkspaces(before)).toBe(false);
    expect(
      spansWorkspaces([
        { ...entry("c1", "NUR 301", "Ada's workspace"), workspaceNumber: null },
        entry("c2", "NUR 301", "Grace's workspace"),
      ]),
    ).toBe(true);
  });
});

describe("studentClassInfo", () => {
  it("carries both names when two workspaces share one", () => {
    const info = studentClassInfo([
      numbered("c1", "NUR 301", "Nursing", 1),
      numbered("c2", "NUR 301", "Nursing", 2),
    ]);
    expect(info.get("c1")?.workspaceName).toBe("Nursing");
    expect(info.get("c2")?.workspaceName).toBe("Nursing");
  });

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
